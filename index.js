/*
 * Server catalog logic.
 *
 * The status dots currently use the status written in index.html.
 * Later, this file can request live data from your own API/backend.
 *
 * Recommended future API response:
 * {
 *   "minecraft": "online",
 *   "gtnh": "restarting"
 * }
 *
 * A browser should not directly query a Minecraft server's raw port.
 * Instead, use a small backend/API that checks the server and returns
 * safe JSON to this page.
 */

document.addEventListener("DOMContentLoaded", () => {
  const filterLinks = document.querySelectorAll("[data-catalog-filter]");
  const serverCards = document.querySelectorAll("[data-server-type]");

  filterLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const filter = link.dataset.catalogFilter;

      serverCards.forEach((card) => {
        const shouldShow = filter === "all" || card.dataset.serverType === filter;
        card.hidden = !shouldShow;
      });
    });
  });

  // Future example:
  // updateServerStatuses("/api/servers");
});

/*
 * Future live-status function.
 * Keep this here so the frontend is ready when the API exists.
 */
async function updateServerStatuses(apiUrl) {
  try {
    const response = await fetch(apiUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const servers = await response.json();

    document.querySelectorAll("[data-server-id]").forEach((card) => {
      const serverId = card.dataset.serverId;
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
