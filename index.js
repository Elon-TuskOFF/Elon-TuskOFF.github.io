// Server catalog filtering and live status updates.

document.addEventListener("DOMContentLoaded", () => {
  const filterLinks = document.querySelectorAll("[data-filter]");
  const serverCards = document.querySelectorAll("[data-server]");
  const logoContainer = document.querySelector(".site-logo-image");

  filterLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const selectedServer = link.dataset.filter;

      serverCards.forEach((card) => {
        const showAll = selectedServer === "all";
        const matchesServer = card.dataset.server === selectedServer;

        card.hidden = !showAll && !matchesServer;
      });
    });
  });

  // Create a completely new GIF URL on every hover.
  // The timestamp prevents the browser from reusing the already-decoded animation,
  // so the GIF starts from its first frame every time.
  if (logoContainer) {
    const staticLogoSrc = "images/Minecraft_Polytechnic.png";
    const animatedLogoSrc = "gifs/animated_minecraftPoly.gif";
    let animatedLogo = null;

    logoContainer.addEventListener("mouseenter", () => {
      if (animatedLogo) return;

      const staticLogo = logoContainer.querySelector(".logo-static");
      if (!staticLogo) return;

      animatedLogo = document.createElement("img");
      animatedLogo.className = "logo-animated";
      animatedLogo.src = `${animatedLogoSrc}?hover=${Date.now()}`;
      animatedLogo.alt = "";
      animatedLogo.setAttribute("aria-hidden", "true");

      staticLogo.replaceWith(animatedLogo);
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
