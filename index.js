document.addEventListener("DOMContentLoaded", () => {
  const heroImage = document.querySelector(".hero-image");
  const logo = document.querySelector(".site-logo-image");

  // Rotate hero wallpapers every 7 seconds.
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
