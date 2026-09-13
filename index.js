// Server catalog filtering and live status updates.

document.addEventListener("DOMContentLoaded", () => {
  const filterLinks = document.querySelectorAll("[data-filter]");
  const serverCards = document.querySelectorAll("[data-server]");
  const logoContainer = document.querySelector(".site-logo-image");
  const catalogDropdown = document.querySelector(".catalog-dropdown");
  const catalogLink = document.querySelector(".catalog-link");
  const heroImage = document.querySelector(".hero-image");

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

  // Change the hero wallpaper once per day.
  // Put your wallpapers in /everydayimg. The script automatically finds
  // image files in that folder, so you do not need to edit this code when
  // adding or removing wallpapers.
  if (heroImage) {
    const fallbackImage = "images/Prometheus.jpg";
    const imageExtensions = /\.(avif|gif|jpe?g|png|webp)$/i;
    const imageFolder = "everydayimg";
    const repositoryApi = "https://api.github.com/repos/Elon-TuskOFF/Elon-TuskOFF.github.io/contents/everydayimg?ref=Test-4";

    // Use the local date, so the wallpaper changes at the user's midnight.
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    let dayNumber = 0;

    // The GitHub API provides the folder contents. This means the website
    // automatically notices new images without changing index.js.
    fetch(repositoryApi, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Wallpaper folder returned ${response.status}`);
        return response.json();
      })
      .then((files) => {
        const wallpapers = files
          .filter((file) => file.type === "file" && imageExtensions.test(file.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        if (!wallpapers.length) throw new Error("No wallpapers found");

        // Convert the calendar date into a stable number. The same image is
        // shown all day, then the next image is selected the following day.
        const startDate = new Date(2026, 0, 1);
        const millisecondsPerDay = 24 * 60 * 60 * 1000;
        dayNumber = Math.floor((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - startDate) / millisecondsPerDay);

        const wallpaper = wallpapers[((dayNumber % wallpapers.length) + wallpapers.length) % wallpapers.length];
        heroImage.style.backgroundImage = `linear-gradient(90deg, rgba(18,18,18,.04) 0%, rgba(18,18,18,.08) 42%, rgba(18,18,18,.72) 100%), url("${wallpaper.download_url}")`;
        heroImage.dataset.wallpaperDate = dateKey;
      })
      .catch((error) => {
        // Keep the existing Prometheus wallpaper if the folder is missing,
        // empty, or temporarily unavailable.
        heroImage.style.backgroundImage = `linear-gradient(90deg, rgba(18,18,18,.04) 0%, rgba(18,18,18,.08) 42%, rgba(18,18,18,.72) 100%), url("${fallbackImage}")`;
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

      // Never reuse the previous object URL. A new URL forces a fresh GIF
      // decoder instance instead of continuing from the previous frame.
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

      indicator.classList.remove(
        "status-online",
        "status-restarting",
        "status-stopped"
      );

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
