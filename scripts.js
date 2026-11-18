
const menuToggle = document.getElementById("menu-toggle");
const sidebar = document.getElementById("sidebar");
const pages = document.querySelectorAll(".content-box");
const tocLinks = document.querySelectorAll(".toc-submenu a, .toc-home");
const tocToggles = document.querySelectorAll(".toc-toggle");

const sectionNavigation = document.getElementById("section-navigation");
const sectionSelect = document.getElementById("section-select");

const STORAGE_PAGE = "bac_last_page";
const STORAGE_SCROLL = "bac_scroll_positions";

const textCache = new Map();
const scrollPositions = new Map();

let currentPage = null;
let restoringPosition = false;
let sectionHeadings = [];
let sectionScrollFrame = null;

try {
    const savedPositions = JSON.parse(
        localStorage.getItem(STORAGE_SCROLL) || "{}"
    );

    Object.entries(savedPositions).forEach(([pageId, position]) => {
        if (typeof position === "number" && Number.isFinite(position)) {
            scrollPositions.set(pageId, position);
        }
    });
} catch {
    localStorage.removeItem(STORAGE_SCROLL);
}

if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
}

function closeMenu() {
    sidebar.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.textContent = "☰";
}

function toggleMenu() {
    const isOpen = sidebar.classList.toggle("open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.textContent = isOpen ? "×" : "☰";
}

function expandGroup(group) {
    document.querySelectorAll(".toc-group").forEach(item => {
        const toggle = item.querySelector(".toc-toggle");
        const submenu = item.querySelector(".toc-submenu");

        if (!toggle || !submenu) return;

        const expanded = item === group;

        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.querySelector(".toc-arrow").textContent = expanded ? "−" : "+";
        submenu.hidden = !expanded;
    });
}

function parseText(raw) {
    const sections = {};

    const parts = raw.split(/^\s*===\s*(.+?)\s*===\s*$/gm);

    for (let i = 1; i < parts.length; i += 2) {
        const name = parts[i].trim().toLowerCase();
        sections[name] = parts[i + 1].trim();
    }

    return sections;
}

async function loadText(filename) {
    if (textCache.has(filename)) {
        return textCache.get(filename);
    }

    try {
        const response = await fetch(filename, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const raw = await response.text();
        const sections = parseText(raw);

        textCache.set(filename, sections);

        return sections;
    } catch (error) {
        console.warn(`Nu s-a putut încărca ${filename}`, error);
        return {};
    }
}

function renderText(container, text) {
    container.replaceChildren();

    if (!text) {
        const placeholder = document.createElement("p");
        placeholder.className = "tba";
        placeholder.textContent = "În curs de redactare";
        container.appendChild(placeholder);
        return;
    }

    if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
        container.textContent = "Eroare la încărcarea formatării.";
        return;
    }

    const html = marked.parse(text, {
        gfm: true,
        breaks: false
    });

    container.innerHTML = DOMPurify.sanitize(html);

const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
const textNodes = [];

while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes("⇒")) {
        textNodes.push(walker.currentNode);
    }
}

textNodes.forEach(node => {
    const parts = node.textContent.split("⇒");
    const fragment = document.createDocumentFragment();

    parts.forEach((part, index) => {
        if (index > 0) {
            const arrow = document.createElement("span");
            arrow.className = "text-arrow";
            arrow.textContent = "⇒";
            fragment.appendChild(arrow);
        }

        fragment.appendChild(document.createTextNode(part));
    });

    node.replaceWith(fragment);
});


if (container.closest(".content-box")?.dataset.section === "secvente") {
    container.querySelectorAll("h1").forEach(heading => {
        const text = heading.textContent;
        const separator = text.indexOf(" - ");

        if (separator === -1) return;

        const title = text.slice(0, separator);
        const explanation = text.slice(separator + 3);

        const span = document.createElement("span");
        span.className = "heading-explanation";
        span.textContent = explanation;

        heading.replaceChildren(
            document.createTextNode(title),
            span
        );
    });
}

}

async function loadPageContent(page) {
    const container = page.querySelector(".text-content");

    if (container.dataset.loaded === "true") {
        return;
    }

    const filename = page.dataset.file;
    const section = page.dataset.section;

    const sections = await loadText(filename);

    renderText(container, sections[section]);

    container.dataset.loaded = "true";
}

function updateSectionNavigation(page) {
    sectionHeadings = [];
    sectionSelect.replaceChildren();

    const headings = page.querySelectorAll(
        ".text-content h1, .text-content h2"
    );

    headings.forEach((heading, index) => {
        heading.id = `${page.id}-section-${index}`;

        const option = document.createElement("option");
        option.value = heading.id;
        option.textContent = heading.textContent.trim();

        sectionSelect.appendChild(option);
        sectionHeadings.push(heading);
    });

    sectionNavigation.hidden = headings.length === 0;

    if (headings.length > 0) {
        syncCurrentSection();
    }
}


function syncCurrentSection() {
    if (!sectionHeadings.length || sectionNavigation.hidden) {
        return;
    }

    const threshold = window.innerWidth <= 768 ? 130 : 140;
    let current = sectionHeadings[0];

    sectionHeadings.forEach(heading => {
        if (heading.getBoundingClientRect().top <= threshold) {
            current = heading;
        }
    });

    sectionSelect.value = current.id;
}

function saveReadingProgress() {
    if (restoringPosition || !currentPage) {
        return;
    }

    scrollPositions.set(currentPage, window.scrollY);

    localStorage.setItem(STORAGE_PAGE, currentPage);
    localStorage.setItem(
        STORAGE_SCROLL,
        JSON.stringify(Object.fromEntries(scrollPositions))
    );
}

async function showPage(pageId) {
    const page = document.getElementById(pageId);

    if (!page || !page.classList.contains("content-box")) {
        return;
    }

    if (currentPage === pageId) {
        closeMenu();
        return;
    }

    if (currentPage && !restoringPosition) {
        saveReadingProgress();
    }

    restoringPosition = true;

    pages.forEach(item => {
        item.classList.toggle("active", item === page);
    });

    tocLinks.forEach(link => {
        const active = link.getAttribute("href") === "#" + pageId;

        link.classList.toggle("active", active);

        if (active) {
            const group = link.closest(".toc-group");

            if (group && group.querySelector(".toc-toggle")) {
                expandGroup(group);
            } else {
                expandGroup(null);
            }

            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    currentPage = pageId;

    localStorage.setItem(STORAGE_PAGE, pageId);

    closeMenu();

    window.scrollTo({
        top: 0,
        behavior: "instant"
    });

    await loadPageContent(page);

    if (currentPage !== pageId) {
        return;
    }

    updateSectionNavigation(page);

    requestAnimationFrame(() => {
        window.scrollTo({
            top: scrollPositions.get(pageId) || 0,
            behavior: "instant"
        });

        requestAnimationFrame(() => {
            restoringPosition = false;
            syncCurrentSection();
        });
    });
}

function navigateToPage() {
    const hashPage = decodeURIComponent(
        window.location.hash.substring(1)
    );

    const savedPage = localStorage.getItem(STORAGE_PAGE);

    const pageId = hashPage
        || savedPage
        || "acasa";

    showPage(pageId);
}

tocToggles.forEach(toggle => {
    toggle.addEventListener("click", () => {
        const group = toggle.closest(".toc-group");
        const submenu = group.querySelector(".toc-submenu");

        const expanded =
            toggle.getAttribute("aria-expanded") === "true";

        if (expanded) {
            toggle.setAttribute("aria-expanded", "false");
            toggle.querySelector(".toc-arrow").textContent = "+";
            submenu.hidden = true;
        } else {
            expandGroup(group);
        }
    });
});

tocLinks.forEach(link => {
    link.addEventListener("click", () => {
        if (window.location.hash === link.getAttribute("href")) {
            showPage(link.getAttribute("href").substring(1));
        }
    });
});

menuToggle.addEventListener("click", toggleMenu);

document.addEventListener("click", event => {
    if (
        sidebar.classList.contains("open") &&
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
    ) {
        closeMenu();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeMenu();
    }
});

sectionSelect.addEventListener("change", () => {
    const heading = document.getElementById(sectionSelect.value);

    if (!heading) {
        return;
    }

    heading.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

window.addEventListener("scroll", () => {
    if (sectionScrollFrame !== null) {
        return;
    }

    sectionScrollFrame = requestAnimationFrame(() => {
        syncCurrentSection();
        saveReadingProgress();
        sectionScrollFrame = null;
    });
}, { passive: true });

window.addEventListener("resize", syncCurrentSection);

window.addEventListener("pagehide", saveReadingProgress);

window.addEventListener("hashchange", navigateToPage);

navigateToPage();


const backToTop = document.getElementById("back-to-top");

function updateBackToTop() {
    const visible = window.scrollY > window.innerHeight * 0.2;
    backToTop.classList.toggle("visible", visible);
}

backToTop.addEventListener("click", () => {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});

window.addEventListener("scroll", updateBackToTop, {
    passive: true
});

window.addEventListener("resize", updateBackToTop);

updateBackToTop();


const downloadPDF = document.getElementById("download-pdf");

downloadPDF.addEventListener("click", () => {
    if (!currentPage) return;

    window.print();
});
