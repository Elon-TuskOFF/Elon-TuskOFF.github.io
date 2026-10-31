import { WALLPAPERS } from "./wallpapers.js";
import { initializeComments } from "./comments.js";

const WALLPAPER_INTERVAL = 7_000;
const FADE_DURATION = 500;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Decode a local image before displaying it, so a slow load never flashes blank. */
async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function initializeWallpapers() {
  const hero = document.querySelector("#hero-wallpaper");
  if (!hero || WALLPAPERS.length < 2) return;

  let current = Math.max(0, WALLPAPERS.indexOf(hero.getAttribute("src").replace(/^\.\//, "")));
  let timer;
  let revision = 0;
  const canAnimate = () => !document.hidden && !reducedMotion.matches;

  // Only the next wallpaper is loaded, rather than downloading the whole gallery.
  async function prepareNext() {
    const request = revision;
    const next = (current + 1) % WALLPAPERS.length;
    let image;

    try {
      image = await loadImage(WALLPAPERS[next]);
    } catch {
      // Keep the current wallpaper if an asset is temporarily unavailable.
      if (request === revision && canAnimate()) {
        timer = window.setTimeout(prepareNext, WALLPAPER_INTERVAL);
      }
      return;
    }

    if (request !== revision || !canAnimate()) return;
    timer = window.setTimeout(() => {
      hero.dataset.changing = "true";
      timer = window.setTimeout(() => {
        hero.src = image.src;
        current = next;
        delete hero.dataset.changing;
        prepareNext();
      }, FADE_DURATION);
    }, WALLPAPER_INTERVAL);
  }

  function updatePlayback() {
    revision += 1;
    window.clearTimeout(timer);
    delete hero.dataset.changing;
    if (canAnimate()) prepareNext();
  }

  document.addEventListener("visibilitychange", updatePlayback);
  reducedMotion.addEventListener("change", updatePlayback);
  updatePlayback();
}

function initializeLogo() {
  const logo = document.querySelector("#site-logo");
  if (!logo) return;

  const staticSource = logo.getAttribute("src");
  const link = logo.closest("a");
  let hovered = false;

  // Load the GIF on first hover; browsers cache it for subsequent visits.
  link.addEventListener("pointerenter", async (event) => {
    if (event.pointerType === "touch" || reducedMotion.matches) return;
    hovered = true;
    try {
      const image = await loadImage("gifs/animated_minecraftPoly.gif");
      if (hovered && !reducedMotion.matches) logo.src = image.src;
    } catch {
      // The static logo remains available when the animation cannot load.
    }
  });

  function resetLogo() {
    hovered = false;
    logo.src = staticSource;
  }

  link.addEventListener("pointerleave", resetLogo);
  reducedMotion.addEventListener("change", resetLogo);
}

function initializeDropdowns() {
  const dropdowns = [...document.querySelectorAll("[data-dropdown]")];

  function closeDropdowns(except = null) {
    for (const dropdown of dropdowns) {
      if (dropdown !== except) dropdown.open = false;
    }
  }

  document.addEventListener("click", (event) => {
    const active = event.target.closest("[data-dropdown]");
    closeDropdowns(active);
    if (event.target.closest("a")) closeDropdowns();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const active = dropdowns.find((dropdown) => dropdown.open);
    closeDropdowns();
    active?.querySelector("summary").focus();
  });
}

initializeWallpapers();
initializeLogo();
initializeDropdowns();

initializeComments();
