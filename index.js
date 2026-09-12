// Server catalog filtering and live status updates.

document.addEventListener("DOMContentLoaded", () => {
  const filterLinks = document.querySelectorAll("[data-filter]");
  const serverCards = document.querySelectorAll("[data-server]");
  const logoContainer = document.querySelector(".site-logo-image");
  const catalogDropdown = document.querySelector(".catalog-dropdown");
  const catalogLink = document.querySelector(".catalog-link");

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

  // Load the GIF before the user hovers so there is no blank/frozen moment.
  // Each hover creates a fresh image using the already-loaded GIF data,
  // which makes the animation begin from its first frame without network lag.
  if (logoContainer) {
    const staticLogoSrc = "images/Minecraft_Polytechnic.png";
    const animatedLogoSrc = "gifs/animated_minecraftPoly.gif";
    let animatedLogoUrl = null;
    let animatedLogo = null;

    fetch(animatedLogoSrc, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`GIF returned ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        animatedLogoUrl = URL.createObjectURL(blob);
      })
      .catch((error) => {
        console.error("Unable to preload animated logo:", error);
      });

    logoContainer.addEventListener("mouseenter", () => {
      if (animatedLogo || !animatedLogoUrl) return;

      const staticLogo = logoContainer.querySelector(".logo-static");
      if (!staticLogo) return;

      const nextLogo = document.createElement("img");
      nextLogo.className = "logo-animated";
      nextLogo.src = animatedLogoUrl;
      nextLogo.alt = "";
      nextLogo.setAttribute("aria-hidden", "true");

      // Wait until the first frame is ready, then replace the static logo.
      // This prevents the visible blink that happened while the GIF loaded.
      nextLogo.addEventListener(
        "load",
        () => {
          if (logoContainer.contains(staticLogo)) {
            staticLogo.replaceWith(nextLogo);
            animatedLogo = nextLogo;
          }
        },
        { once: true }
      );
    });

    logoContainer.addEventListener("mouseleave", () => {
      if (!animatedLogo) return;

      const staticLogo = document.createElement("img");
      staticLogo.className = "logo-static";
      staticLogo.src = staticLogoSrc;
      staticLogo.alt = "Логотип";

      animatedLogo.replaceWith(staticLogo);
      animatedLogo = null;
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
