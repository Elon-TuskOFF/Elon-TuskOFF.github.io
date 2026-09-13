// Server catalog filtering and live status updates.

document.addEventListener("DOMContentLoaded", () => {
  const filterLinks = document.querySelectorAll("[data-filter]");
  const serverCards = document.querySelectorAll("[data-server]");
  const logoContainer = document.querySelector(".site-logo-image");
  const catalogDropdown = document.querySelector(".catalog-dropdown");
  const catalogLink = document.querySelector(".catalog-link");
  const heroImage = document.querySelector(".hero-image");
  const wallpaperSliderTrack = document.querySelector(".wallpaper-slider-track");

  filterLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const selectedServer = link.dataset.filter;

      serverCards.forEach((card) => {
        const showAll = selectedServer === "all";
        const matchesServer = card.dataset.server === selectedServer;

        card.hidden = !showAll && !matchesServer;
      });

      catalogDropdown?.classList.remove("is-open");
    });
  });

  // Keep the catalog menu open until the user deliberately closes it.
  if (catalogDropdown && catalogLink) {
    catalogLink.addEventListener("click", (event) => {
      event.preventDefault();
      catalogDropdown.classList.toggle("is-open");
    });

    document.addEventListener("click", (event) => {
      if (!catalogDropdown.contains(event.target)) {
        catalogDropdown.classList.remove("is-open");
      }
    });
  }

  // Change the hero wallpaper once per day and build the desktop hover slider.
  // The wallpaper list is cached locally so the correct image can be chosen
  // synchronously in <head> on the next visit, before the page is painted.
  if (heroImage) {
    const imageExtensions = /\.(avif|gif|jpe?g|png|webp)$/i;
    const repositoryApi = "https://api.github.com/repos/Elon-TuskOFF/Elon-TuskOFF.github.io/contents/everydayimg?ref=Test-4";
    const wallpaperCacheKey = "dailyWallpaperCache";

    const setWallpaper = (wallpaper, index, wallpapers) => {
      if (!wallpaper) return;

      const background = `linear-gradient(90deg, rgba(18,18,18,.04) 0%, rgba(18,18,18,.08) 42%, rgba(18,18,18,.72) 100%), url("${wallpaper}")`;
      document.documentElement.style.setProperty("--hero-wallpaper", background);

      if (wallpaperSliderTrack) {
        wallpaperSliderTrack.querySelectorAll(".wallpaper-slider-item").forEach((item, itemIndex) => {
          item.classList.toggle("is-active", itemIndex === index);
        });
      }
    };

    const buildWallpaperSlider = (wallpapers) => {
      if (!wallpaperSliderTrack || wallpapers.length < 2) return;

      wallpaperSliderTrack.replaceChildren();

      wallpapers.forEach((wallpaper, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "wallpaper-slider-item";
        item.setAttribute("aria-label", `Шпалери ${index + 1}`);
        item.title = `Шпалери ${index + 1}`;

        const label = document.createElement("span");
        label.textContent = String(index + 1).padStart(2, "0");
        item.appendChild(label);

        // Hovering, rather than clicking, changes the wallpaper.
        item.addEventListener("mouseenter", () => {
          setWallpaper(wallpaper, index, wallpapers);
        });

        wallpaperSliderTrack.appendChild(item);
      });

      // Mark today's wallpaper as active without requiring a hover.
      const today = new Date();
      const startDate = new Date(2026, 0, 1);
      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      const dayNumber = Math.floor(
        (new Date(today.getFullYear(), today.getMonth(), today.getDate()) - startDate) / millisecondsPerDay
      );
      const todayIndex = ((dayNumber % wallpapers.length) + wallpapers.length) % wallpapers.length;
      setWallpaper(wallpapers[todayIndex], todayIndex, wallpapers);
    };

    // Build immediately from the cache when available, so the slider appears
    // without waiting for the GitHub API request.
    try {
      const cached = JSON.parse(localStorage.getItem(wallpaperCacheKey) || "null");
      if (cached && Array.isArray(cached.wallpapers) && cached.wallpapers.length) {
        buildWallpaperSlider(cached.wallpapers);
      }
    } catch (error) {}

    fetch(repositoryApi, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Wallpaper folder returned ${response.status}`);
        return response.json();
      })
      .then((files) => {
        const wallpapers = files
          .filter((file) => file.type === "file" && imageExtensions.test(file.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((file) => file.download_url)
          .filter(Boolean);

        if (!wallpapers.length) throw new Error("No wallpapers found");

        try {
          localStorage.setItem(wallpaperCacheKey, JSON.stringify({ wallpapers }));
        } catch (error) {
          console.warn("Unable to cache wallpaper list:", error);
        }

        buildWallpaperSlider(wallpapers);

        const today = new Date();
        const startDate = new Date(2026, 0, 1);
        const millisecondsPerDay = 24 * 60 * 60 * 1000;
        const dayNumber = Math.floor(
          (new Date(today.getFullYear(), today.getMonth(), today.getDate()) - startDate) / millisecondsPerDay
        );
        const index = ((dayNumber % wallpapers.length) + wallpapers.length) % wallpapers.length;
        setWallpaper(wallpapers[index], index, wallpapers);
        heroImage.dataset.wallpaperDate = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
      })
      .catch((error) => {
        // CSS keeps the Prometheus fallback if the folder is unavailable.
        console.warn("Unable to load daily wallpaper:", error);
      });
  }

  // Preload the GIF data once. A brand-new Blob URL is created for every
  // hover so the browser gets a fresh GIF resource and starts at frame 1.
  if (logoContainer) {
    const staticLogoSrc = "images/Minecraft_Polytechnic.png";
    const animatedLogoSrc = "gifs/animated_minecraftPoly.gif";
    let animatedLogoBlob = null;
    let animatedLogo = null;
    let animatedLogoUrl = null;
    let isHoveringLogo = false;

    fetch(animatedLogoSrc, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`GIF returned ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        animatedLogoBlob = blob;
      })
      .catch((error) => {
        console.error("Unable to preload animated logo:", error);
      });

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

      nextLogo.addEventListener(
        "load",
        () => {
          if (!isHoveringLogo || !logoContainer.contains(staticLogo)) {
            URL.revokeObjectURL(animatedLogoUrl);
            animatedLogoUrl = null;
            return;
          }

          staticLogo.replaceWith(nextLogo);
          animatedLogo = nextLogo;
        },
        { once: true }
      );
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

  // Later: updateServerStatuses("/api/servers");
});

// Updates server status indicators using data from the server-status API.
async function updateServerStatuses(apiUrl) {
  try {
    const response = await fetch(apiUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const servers = await response.json();

    document.querySelectorAll("[data-server]").forEach((card) => {
      const serverId = card.dataset.server;
      const status = servers[serverId];
      const indicator = card.querySelector(".server-status");

      if (!indicator || !status) return;

      indicator.classList.remove("status-online", "status-restarting", "status-stopped");

      if (status === "online") {
        indicator.classList.add("status-online");
      } else if (status === "restarting") {
        indicator.classList.add("status-restarting");
      } else {
        indicator.classList.add("status-stopped");
      }

      indicator.title = status;
      indicator.setAttribute("aria-label", status);
    });
  } catch (error) {
    console.error("Unable to update server statuses:", error);
  }
}
