// Lightweight JavaScript only for behavior that CSS/HTML cannot handle.

document.addEventListener("DOMContentLoaded", () => {
  const logoContainer = document.querySelector(".site-logo-image");
  const heroImage = document.querySelector(".hero-image");
  const catalog = document.querySelector("#catalog");

  // Header catalog: all options now open the full catalog without filtering any servers.
  document.querySelectorAll(".catalog-menu label[for]").forEach((label) => {
    label.addEventListener("click", () => {
      const filterAll = document.getElementById("filter-all");
      if (filterAll) filterAll.checked = true;
      if (catalog) {
        window.requestAnimationFrame(() => {
          catalog.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      const dropdown = label.closest("details");
      if (dropdown) dropdown.removeAttribute("open");
    });
  });

  // Automatically rotate hero wallpapers every 7 seconds.
  if (heroImage) {
    const imageExtensions = /\.(avif|gif|jpe?g|png|webp)$/i;
    const repositoryApi = "https://api.github.com/repos/Elon-TuskOFF/Elon-TuskOFF.github.io/contents/everydayimg?ref=Test-4";
    const rotationInterval = 7000;
    let wallpapers=[]; let currentIndex=0; let rotationTimer=null;
    const preloadImage=(src)=>{const image=new Image(); image.src=src; return image;};
    const setWallpaper=(wallpaper,animate=true)=>{if(!wallpaper)return; const background=`linear-gradient(90deg,rgba(18,18,18,.04) 0%,rgba(18,18,18,.08) 42%,rgba(18,18,18,.72) 100%),url("${wallpaper}")`; if(!animate){document.documentElement.style.setProperty("--hero-wallpaper",background);return;} heroImage.classList.add("wallpaper-changing"); window.setTimeout(()=>{document.documentElement.style.setProperty("--hero-wallpaper",background);heroImage.classList.remove("wallpaper-changing");},450);};
    const startRotation=()=>{if(rotationTimer)window.clearInterval(rotationTimer);if(wallpapers.length<2)return;rotationTimer=window.setInterval(()=>{currentIndex=(currentIndex+1)%wallpapers.length;setWallpaper(wallpapers[currentIndex]);},rotationInterval);};
    fetch(repositoryApi,{cache:"no-store"}).then((response)=>{if(!response.ok)throw new Error(`Wallpaper folder returned ${response.status}`);return response.json();}).then((files)=>{const freshWallpapers=files.filter((file)=>file.type==="file"&&imageExtensions.test(file.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).map((file)=>file.download_url).filter(Boolean);if(!freshWallpapers.length)throw new Error("No wallpapers found");wallpapers=freshWallpapers;currentIndex=0;preloadImage(wallpapers[0]);setWallpaper(wallpapers[0],false);wallpapers.forEach(preloadImage);startRotation();}).catch((error)=>console.warn("Unable to load wallpapers:",error));
  }

  // Preload the GIF data once. A brand-new Blob URL is created for every hover.
  if (logoContainer) {
    const staticLogoSrc="images/Minecraft_Polytechnic.png"; const animatedLogoSrc="gifs/animated_minecraftPoly.gif"; let animatedLogoBlob=null; let animatedLogo=null; let animatedLogoUrl=null; let isHoveringLogo=false;
    fetch(animatedLogoSrc,{cache:"force-cache"}).then((response)=>{if(!response.ok)throw new Error(`GIF returned ${response.status}`);return response.blob();}).then((blob)=>{animatedLogoBlob=blob;}).catch((error)=>console.error("Unable to preload animated logo:",error));
    logoContainer.addEventListener("mouseenter",()=>{isHoveringLogo=true;if(animatedLogo||!animatedLogoBlob)return;const staticLogo=logoContainer.querySelector(".logo-static");if(!staticLogo)return;animatedLogoUrl=URL.createObjectURL(animatedLogoBlob);const nextLogo=document.createElement("img");nextLogo.className="logo-animated";nextLogo.src=animatedLogoUrl;nextLogo.alt="";nextLogo.setAttribute("aria-hidden","true");nextLogo.addEventListener("load",()=>{if(!isHoveringLogo||!logoContainer.contains(staticLogo)){URL.revokeObjectURL(animatedLogoUrl);animatedLogoUrl=null;return;}staticLogo.replaceWith(nextLogo);animatedLogo=nextLogo;},{once:true});});
    logoContainer.addEventListener("mouseleave",()=>{isHoveringLogo=false;if(animatedLogo){const staticLogo=document.createElement("img");staticLogo.className="logo-static";staticLogo.src=staticLogoSrc;staticLogo.alt="Логотип";animatedLogo.replaceWith(staticLogo);animatedLogo=null;}if(animatedLogoUrl){URL.revokeObjectURL(animatedLogoUrl);animatedLogoUrl=null;}});
  }
});

async function updateServerStatuses(apiUrl){try{const response=await fetch(apiUrl,{cache:"no-store"});if(!response.ok)throw new Error(`API returned ${response.status}`);const servers=await response.json();document.querySelectorAll("[data-server]").forEach((card)=>{const status=servers[card.dataset.server];const indicator=card.querySelector(".server-status");if(!indicator||!status)return;indicator.classList.remove("status-online","status-restarting","status-stopped");indicator.classList.add(status==="online"?"status-online":status==="restarting"?"status-restarting":"status-stopped");indicator.title=status;indicator.setAttribute("aria-label",status);});}catch(error){console.error("Unable to update server statuses:",error);}}
