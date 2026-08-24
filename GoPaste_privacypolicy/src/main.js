import "./style.css";

const policySections = [
  {
    id: "what-we-handle",
    title: "What GoPaste handles",
    body: `GoPaste handles only the content needed to provide its local image and GIF library. When you explicitly choose “Save to GoPaste,” the extension may process the selected image or GIF, its source URL, the URL of the page where it was selected, and limited local usage information such as copy and drag counts.`,
  },
  {
    id: "how-we-use",
    title: "How the information is used",
    body: `This information is used only to save, organize, find, copy, drag, export, import, and maintain your personal library. If a selected image cannot be retrieved directly, GoPaste may inspect the originating page solely to recover that selected image.`,
  },
  {
    id: "local-storage",
    title: "Stored locally on your device",
    body: `Saved media, source information, categories, preferences, backups, and local usage insights are stored in your Chrome profile using IndexedDB. GoPaste has no user accounts, cloud synchronization, remote backup, advertising, analytics, or GoPaste-operated media servers.`,
  },
  {
    id: "sharing",
    title: "Sharing is your choice",
    body: `GoPaste only sends a saved image or GIF to another website or app when you explicitly copy, paste, drag, download, export, or otherwise share that item. A ZIP backup is created only when you request one and choose where to save it.`,
  },
  {
    id: "permissions",
    title: "Why GoPaste requests Chrome permissions",
    body: `GoPaste uses Chrome permissions to add the “Save to GoPaste” image menu item, fetch a user-selected image, recover that image from its source page when needed, copy it to your clipboard, save user-requested downloads and backups, and store your local media library. These permissions are used only for the extension’s stated purpose.`,
  },
  {
    id: "no-sale",
    title: "No sale, advertising, or unrelated use",
    body: `GoPaste does not sell user data, use it for advertising or profiling, or use it to determine creditworthiness or lending eligibility. It does not transfer user data to third parties except when necessary to provide an action you explicitly request, such as sharing a selected image with a destination you choose.`,
  },
  {
    id: "controls",
    title: "Your controls",
    body: `You can delete saved items from GoPaste, export your library as a ZIP archive, or remove all extension data through Chrome’s extension settings. Your local library remains on your device until you delete it or remove the extension.`,
  },
  {
    id: "contact",
    title: "Contact",
    body: `For questions about this policy or your local GoPaste data, use the support contact shown in the GoPaste Chrome Web Store listing.`,
  },
];

const app = document.querySelector("#app");

app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#top" aria-label="GoPaste Privacy Policy home">
      <span class="brand-mark" aria-hidden="true"><span>G</span></span>
      <span>GoPaste</span>
    </a>
    <a class="header-link" href="#policy">Read policy <span aria-hidden="true">↓</span></a>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="page-title">
      <div class="hero-copy">
        <p class="local-signal"><span aria-hidden="true"></span> Device-only by design</p>
        <h1 id="page-title">Your library stays yours.</h1>
        <p class="lede">
          GoPaste keeps your saved images and GIFs on your device. No account, cloud
          sync, advertising, or hidden analytics.
        </p>
      </div>
      <aside class="privacy-promise" aria-label="GoPaste privacy promise">
        <span class="privacy-promise__icon" aria-hidden="true">✓</span>
        <div>
          <strong>Local by default</strong>
          <p>Media and library data live in your Chrome profile.</p>
        </div>
      </aside>
    </section>

    <section class="policy-layout" id="policy" aria-label="Privacy Policy">
      <aside class="policy-aside">
        <p>Privacy Policy</p>
        <time datetime="2026-08-25">Last updated August 25, 2026</time>
        <nav aria-label="Policy sections">
          ${policySections
            .map(
              (section, index) =>
                `<a href="#${section.id}"><span>${String(index + 1).padStart(2, "0")}</span>${section.title}</a>`,
            )
            .join("")}
        </nav>
      </aside>
      <article class="policy-content">
        <div class="policy-intro">
          <p class="policy-intro__label">The short version</p>
          <h2>GoPaste is built to manage your media—not mine it.</h2>
          <p>
            This policy explains what GoPaste handles, why it handles it, and the controls
            you have over your local library.
          </p>
        </div>
        ${policySections
          .map(
            (section, index) => `
              <section class="policy-section" id="${section.id}">
                <p class="policy-section__number">${String(index + 1).padStart(2, "0")}</p>
                <div>
                  <h3>${section.title}</h3>
                  <p>${section.body}</p>
                </div>
              </section>
            `,
          )
          .join("")}
      </article>
    </section>
  </main>

  <footer class="site-footer">
    <p>GoPaste is a local-first Chrome extension for images and GIFs.</p>
    <a href="#top">Back to top ↑</a>
  </footer>
`;
