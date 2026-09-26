document.addEventListener("DOMContentLoaded", () => {
  const heroImage = document.querySelector(".hero-image");
  const logo = document.querySelector(".site-logo-image");

  // Changing wallpapers every 7 seconds.
  if (heroImage) {
    const folder = "https://api.github.com/repos/Elon-TuskOFF/Elon-TuskOFF.github.io/contents/everydayimg?ref=Test-4";
    const imageFile = /\.(jpe?g|png)$/i;
    let wallpapers = [];
    let current = 0;

    const preload = (src) => {
      const image = new Image();
      image.src = src;
    };

    const showWallpaper = (src, animate = true) => {
      if (!src) return;

      const background = `linear-gradient(90deg, rgba(18,18,18,.04) 0%, rgba(18,18,18,.08) 42%, rgba(18,18,18,.72) 100%), url("${src}")`;

      if (!animate) {
        document.documentElement.style.setProperty("--hero-wallpaper", background);
        return;
      }

      heroImage.classList.add("wallpaper-changing");
      setTimeout(() => {
        document.documentElement.style.setProperty("--hero-wallpaper", background);
        heroImage.classList.remove("wallpaper-changing");
      }, 450);
    };

    fetch(folder, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Wallpaper folder returned ${response.status}`);
        return response.json();
      })
      .then((files) => {
        wallpapers = files
          .filter((file) => file.type === "file" && imageFile.test(file.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((file) => file.download_url)
          .filter(Boolean);

        if (!wallpapers.length) throw new Error("No wallpapers found");

        wallpapers.forEach(preload);
        showWallpaper(wallpapers[0], false);

        if (wallpapers.length > 1) {
          setInterval(() => {
            current = (current + 1) % wallpapers.length;
            showWallpaper(wallpapers[current]);
          }, 7000);
        }
      })
      .catch((error) => console.warn("Unable to load wallpapers:", error));
  }

  // Live Minecraft status via Cloudflare Worker -> MCSrvStat.
  const minecraftCard = document.querySelector(".minecraft-card");
  if (minecraftCard) {
    const statusDot = minecraftCard.querySelector(".server-status");
    const liveSummary = minecraftCard.querySelector(".minecraft-live-summary");
    const playerPanel = minecraftCard.querySelector(".minecraft-player-panel");
    const playerCount = minecraftCard.querySelector(".minecraft-player-count");
    const playerList = minecraftCard.querySelector(".minecraft-player-list");
    // Prefer the direct status API so the player count is not dependent on the
    // Cloudflare Worker response format.
    const statusApis = [
      "https://api.mcstatus.io/v2/status/java/ger-01-p.leavehosting.com:20025",
      "https://minecraft-status.gandrij549.workers.dev/?server=minecraft"
    ];

    const setStatus = (className, title, label) => {
      statusDot.className = `server-status ${className}`;
      statusDot.title = title;
      statusDot.setAttribute("aria-label", label);
    };

    const loadMinecraftStatus = async () => {
      try {
        setStatus("status-checking", "Перевірка статусу", "Перевірка статусу");
        liveSummary.textContent = "Перевірка статусу…";

        let data = null;
        let lastError = null;

        for (const api of statusApis) {
          try {
            const response = await fetch(api, { cache: "no-store" });
            if (!response.ok) throw new Error(`Status API returned ${response.status}`);
            data = await response.json();
            if (data && typeof data.online === "boolean") break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!data || typeof data.online !== "boolean") {
          throw lastError || new Error("No status API returned valid data");
        }

        const online = data.online === true;
        const onlinePlayers = Number(data.players?.online);
        const maxPlayers = Number(data.players?.max);
        const players = Array.isArray(data.players?.list) ? data.players.list : [];

        if (!online) {
          setStatus("status-stopped", "Зупинений", "Зупинений");
          liveSummary.textContent = "Сервер офлайн";
          playerCount.textContent = "Гравці недоступні";
          playerList.replaceChildren();
          return;
        }

        setStatus("status-online", "Онлайн", "Онлайн");
        const shownOnline = Number.isFinite(onlinePlayers) ? onlinePlayers : 0;
        const shownMax = Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : "?";
        liveSummary.textContent = shownOnline + " / " + shownMax + " гравців онлайн";
        playerCount.textContent = players.length
          ? "Гравці онлайн:"
          : onlinePlayers > 0
            ? "Список гравців недоступний"
            : "Немає гравців онлайн";

        playerList.replaceChildren();
        players.forEach((player) => {
          const name = typeof player === "string" ? player : (player?.name_clean || player?.name);
          if (!name) return;
          const item = document.createElement("li");
          item.textContent = name;
          playerList.appendChild(item);
        });
      } catch (error) {
        console.warn("Unable to load Minecraft status:", error);
        setStatus("status-checking", "Статус недоступний", "Статус недоступний");
        liveSummary.textContent = "Статус тимчасово недоступний";
        playerCount.textContent = "Не вдалося отримати список гравців";
        playerList.replaceChildren();
      }
    };

    minecraftCard.addEventListener("toggle", () => {
      if (minecraftCard.open) {
        playerPanel.hidden = false;
        loadMinecraftStatus();
      }
    });

    loadMinecraftStatus();
    // Refresh every minute; the provider may cache responses, but this makes
    // the page update as soon as a fresh result is available.
    setInterval(loadMinecraftStatus, 60000);
  }

  if (logo) {
    const staticSrc = "images/Minecraft_Polytechnic.png";
    const animatedSrc = "gifs/animated_minecraftPoly.gif";
    let gifBlob = null;
    let animatedLogo = null;
    let gifUrl = null;

    fetch(animatedSrc, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`GIF returned ${response.status}`);
        return response.blob();
      })
      .then((blob) => (gifBlob = blob))
      .catch((error) => console.warn("Unable to preload animated logo:", error));

    logo.addEventListener("mouseenter", () => {
      if (!gifBlob || animatedLogo) return;

      const staticLogo = logo.querySelector(".logo-static");
      if (!staticLogo) return;

      gifUrl = URL.createObjectURL(gifBlob);
      const image = new Image();
      image.className = "logo-animated";
      image.src = gifUrl;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");

      image.onload = () => {
        staticLogo.replaceWith(image);
        animatedLogo = image;
      };
    });

    logo.addEventListener("mouseleave", () => {
      animatedLogo?.replaceWith(
        Object.assign(document.createElement("img"), {
          className: "logo-static",
          src: staticSrc,
          alt: "Логотип"
        })
      );

      animatedLogo = null;

      if (gifUrl) {
        URL.revokeObjectURL(gifUrl);
        gifUrl = null;
      }
    });
  }
});
