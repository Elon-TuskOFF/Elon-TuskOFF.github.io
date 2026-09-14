// Server catalog filtering and live status updates.

document.addEventListener("DOMContentLoaded", () => {
  const filterLinks = document.querySelectorAll("[data-filter]");
  const serverCards = document.querySelectorAll("[data-server]");
  const logoContainer = document.querySelector(".site-logo-image");
  const catalogDropdown = document.querySelector(".catalog-dropdown");
  const catalogLink = document.querySelector(".catalog-link");
  const heroImage = document.querySelector(".hero-image");

  filterLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const selectedServer = link.dataset.filter;
      serverCards.forEach((card) => {
        const showAll = selectedServer === "all";
        card.hidden = !showAll && card.dataset.server !== selectedServer;
      });
      catalogDropdown?.classList.remove("is-open");

      const catalogSection = document.querySelector("#catalog");
      const siteHeader = document.querySelector(".site-header");
      if (catalogSection) {
        const headerHeight = siteHeader?.getBoundingClientRect().height || 0;
        const extraGap = 36;
        const targetY = window.scrollY + catalogSection.getBoundingClientRect().top - headerHeight - extraGap;
        window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      }
    });
  });

  if (catalogDropdown && catalogLink) {
    catalogLink.addEventListener("click", (event) => {
      event.preventDefault();
      catalogDropdown.classList.toggle("is-open");
    });
    document.addEventListener("click", (event) => {
      if (!catalogDropdown.contains(event.target)) catalogDropdown.classList.remove("is-open");
    });
  }

  // Automatically rotate hero wallpapers every 10 seconds.
  // The list is cached so the current wallpaper can be restored immediately.
  if (heroImage) {
    const imageExtensions = /\.(avif|gif|jpe?g|png|webp)$/i;
    const repositoryApi = "https://api.github.com/repos/Elon-TuskOFF/Elon-TuskOFF.github.io/contents/everydayimg?ref=Test-4";
    const wallpaperCacheKey = "wallpaperCache";
    const rotationInterval = 10000;
    let wallpapers = [];
    let currentIndex = 0;
    let rotationTimer = null;

    const preloadImage = (src) => {
      const image = new Image();
      image.src = src;
      return image;
    };

    const setWallpaper = (wallpaper, animate = true) => {
      if (!wallpaper) return;
      const background = `linear-gradient(90deg, rgba(18,18,18,.04) 0%, rgba(18,18,18,.08) 42%, rgba(18,18,18,.72) 100%), url("${wallpaper}")`;

      if (!animate) {
        document.documentElement.style.setProperty("--hero-wallpaper", background);
        return;
      }

      // Fade out, swap the image, then fade back in for a smooth transition.
      heroImage.classList.add("wallpaper-changing");
      window.setTimeout(() => {
        document.documentElement.style.setProperty("--hero-wallpaper", background);
        heroImage.classList.remove("wallpaper-changing");
      }, 450);
    };

    const startRotation = () => {
      if (rotationTimer) window.clearInterval(rotationTimer);
      if (wallpapers.length < 2) return;

      rotationTimer = window.setInterval(() => {
        currentIndex = (currentIndex + 1) % wallpapers.length;
        setWallpaper(wallpapers[currentIndex]);
        try {
          localStorage.setItem(wallpaperCacheKey, JSON.stringify({ wallpapers, index: currentIndex }));
        } catch (error) {}
      }, rotationInterval);
    };

    const applyWallpaperList = (list, initialIndex = 0) => {
      wallpapers = list;
      if (!wallpapers.length) return;
      currentIndex = ((initialIndex % wallpapers.length) + wallpapers.length) % wallpapers.length;
      preloadImage(wallpapers[currentIndex]);
      setWallpaper(wallpapers[currentIndex], false);
      wallpapers.forEach(preloadImage);
      startRotation();
    };

    try {
      const cached = JSON.parse(localStorage.getItem(wallpaperCacheKey) || "null");
      if (cached && Array.isArray(cached.wallpapers) && cached.wallpapers.length) {
        applyWallpaperList(cached.wallpapers, Number.isInteger(cached.index) ? cached.index : 0);
      }
    } catch (error) {}

    fetch(repositoryApi, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Wallpaper folder returned ${response.status}`);
        return response.json();
      })
      .then((files) => {
        const freshWallpapers = files
          .filter((file) => file.type === "file" && imageExtensions.test(file.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((file) => file.download_url)
          .filter(Boolean);

        if (!freshWallpapers.length) throw new Error("No wallpapers found");
        applyWallpaperList(freshWallpapers, 0);
        try {
          localStorage.setItem(wallpaperCacheKey, JSON.stringify({ wallpapers: freshWallpapers, index: 0 }));
        } catch (error) {}
      })
      .catch((error) => console.warn("Unable to load wallpapers:", error));
  }

  // Preload the GIF data once. A brand-new Blob URL is created for every hover.
  if (logoContainer) {
    const staticLogoSrc = "images/Minecraft_Polytechnic.png";
    const animatedLogoSrc = "gifs/animated_minecraftPoly.gif";
    let animatedLogoBlob = null;
    let animatedLogo = null;
    let animatedLogoUrl = null;
    let isHoveringLogo = false;

    fetch(animatedLogoSrc, { cache: "force-cache" }).then((response) => {
      if (!response.ok) throw new Error(`GIF returned ${response.status}`);
      return response.blob();
    }).then((blob) => {
      animatedLogoBlob = blob;
    }).catch((error) => console.error("Unable to preload animated logo:", error));

    logoContainer.addEventListener("mouseenter", () => {
      isHoveringLogo = true;
      if (animatedLogo || !animatedLogoBlob) return;
      const staticLogo = logoContainer.querySelector(".logo-static");
      if (!staticLogo) return;
      animatedLogoUrl = URL.createObjectURL(animatedLogoBlob);
      const nextLogo = document.createElement("img");
      nextLogo.className = "logo-animated";
      nextLogo.src = animatedLogoUrl;
      nextLogo.alt = "";
      nextLogo.setAttribute("aria-hidden", "true");
      nextLogo.addEventListener("load", () => {
        if (!isHoveringLogo || !logoContainer.contains(staticLogo)) {
          URL.revokeObjectURL(animatedLogoUrl);
          animatedLogoUrl = null;
          return;
        }
        staticLogo.replaceWith(nextLogo);
        animatedLogo = nextLogo;
      }, { once: true });
    });

    logoContainer.addEventListener("mouseleave", () => {
      isHoveringLogo = false;
      if (animatedLogo) {
        const staticLogo = document.createElement("img");
        staticLogo.className = "logo-static";
        staticLogo.src = staticLogoSrc;
        staticLogo.alt = "Логотип";
        animatedLogo.replaceWith(staticLogo);
        animatedLogo = null;
      }
      if (animatedLogoUrl) {
        URL.revokeObjectURL(animatedLogoUrl);
        animatedLogoUrl = null;
      }
    });
  }
});

async function updateServerStatuses(apiUrl) {
  try {
    const response = await fetch(apiUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const servers = await response.json();
    document.querySelectorAll("[data-server]").forEach((card) => {
      const status = servers[card.dataset.server];
      const indicator = card.querySelector(".server-status");
      if (!indicator || !status) return;
      indicator.classList.remove("status-online", "status-restarting", "status-stopped");
      indicator.classList.add(status === "online" ? "status-online" : status === "restarting" ? "status-restarting" : "status-stopped");
      indicator.title = status;
      indicator.setAttribute("aria-label", status);
    });
  } catch (error) {
    console.error("Unable to update server statuses:", error);
  }
}
