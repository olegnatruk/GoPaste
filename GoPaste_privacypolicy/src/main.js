import "./style.css";

const CONTACT_EMAIL = "olegnatruk@gmail.com";

const policySections = [
  {
    id: "what-we-handle",
    title: "Information the extension handles",
    body: `<strong>Image and GIF library:</strong> images and GIFs you choose to save, their source URL, the URL of the page where you selected them, titles, categories, and local copy and drag counts.<br><strong>CodeChum account (optional feature):</strong> your email address and password (used only to sign in), a session token, and your account's access status.<br><strong>CodeChum assistance (optional feature):</strong> the challenge description, programming language, selected visible test inputs and expected outputs, requirements, candidate code, optional implementation notes, and check feedback from a CodeChum tab, only when you ask for help.<br><strong>Credentials and settings:</strong> your own Gemini API key, your AI-consent choice, and CodeChum settings. The extension does not scan unrelated pages for CodeChum problems.`,
  },
  {
    id: "how-we-use",
    title: "How the information is used",
    body: `Library information is used only to save, organize, find, copy, drag, export, import, and maintain your personal library. If a selected image cannot be retrieved directly, GoPaste may inspect its source page solely to recover that image. Account information is used only to sign you in and confirm your access to CodeChum assistance. CodeChum challenge information is used only to prepare a candidate solution and revise it after you manually check the result. Data is not used for any other purpose.`,
  },
  {
    id: "local-storage",
    title: "Where information is stored",
    body: `<strong>On your device:</strong> saved media, categories, preferences, and usage insights are stored in your Chrome profile in IndexedDB. CodeChum settings, optional implementation notes, your Gemini API key, your login session token, and paused solver state are stored in Chrome extension storage (chrome.storage.local). Your password is never stored by the extension. GoPaste does not synchronize or upload your media library, and has no advertising, analytics, tracking, or media server.<br><strong>With third parties:</strong> only the account and AI data described in the next two sections leaves your device, over encrypted HTTPS connections.`,
  },
  {
    id: "account",
    title: "Supabase: CodeChum sign-in and access",
    body: `CodeChum assistance requires a member account. When you sign in, your email and password are sent over HTTPS to the Supabase authentication service, which verifies them and returns a session token. The extension stores that token locally, not your password, and checks your account's access status with Supabase when you use CodeChum. Supabase processes and stores your member record under its own privacy policy (<a href="https://supabase.com/privacy" rel="noopener noreferrer">supabase.com/privacy</a>). Nothing from your saved image library is sent to Supabase.`,
  },
  {
    id: "gemini",
    title: "Google Gemini: CodeChum AI requests",
    body: `Only after you affirmatively enable CodeChum AI assistance and start a solver run does the extension send the current CodeChum challenge description, language, selected visible test inputs and expected outputs, relevant requirements, candidate code, optional implementation notes, and later check feedback to Google's Gemini API over HTTPS. Your own Gemini API key authorizes the request and is sent only to Google for this purpose. Google handles that content under its own terms (<a href="https://policies.google.com/privacy" rel="noopener noreferrer">policies.google.com/privacy</a>). Generated code is placed in the CodeChum editor; you choose when to check it. No saved GoPaste image or GIF is ever included. You can turn off AI assistance at any time on the CodeChum page.`,
  },
  {
    id: "sharing",
    title: "Sharing and disclosure",
    body: `Your data is shared only with Supabase (sign-in and access status) and Google Gemini (AI requests) as described above, and only when you use the CodeChum assistant. A saved image or GIF is sent to another website or app only when you explicitly copy, paste, drag, download, export, or otherwise share that item. A ZIP backup is created only when you request one and choose where to save it. We do not sell or rent user data, and we do not disclose it to anyone else, except where required by law.`,
  },
  {
    id: "retention",
    title: "Retention and deletion",
    body: `Library items remain on your device until you delete them or remove the extension. CodeChum session data, notes, and paused solver state are removed when you sign out; notes are also removed when you change accounts. Your Gemini key and AI consent remain until you remove or revoke them in the CodeChum page. Removing the extension through Chrome deletes all locally stored data. The GoPaste developer does not receive or keep copies of your library, API key, or challenge content. To request deletion of your Supabase member record, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>; requests are handled within 30 days.`,
  },
  {
    id: "permissions",
    title: "Why GoPaste requests Chrome permissions",
    body: `Permissions let GoPaste add the “Save to GoPaste” menu item, fetch a user-selected image from any site, recover it from its page when needed, copy or attach it, store the local library, and create user-requested downloads and backups. The CodeChum assistant uses site access and scripting only on CodeChum pages and only when you select a problem and invoke its controls; extension storage keeps its session, settings, and checkpoints. Both features are described in the store listing.`,
  },
  {
    id: "limited-use",
    title: "Limited Use disclosure",
    body: `The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements. User data is used only to provide or improve the single-purpose features described here. It is not sold, not transferred to third parties except as described above or as necessary to comply with law, not used or transferred for advertising, personalized ads, or to determine creditworthiness or lending eligibility, and not read by humans except with your consent, for security purposes, or to comply with law.`,
  },
  {
    id: "controls",
    title: "Your controls",
    body: `You can delete media, export a ZIP backup, sign out of CodeChum, revoke AI assistance, remove your local Gemini key, or remove the extension and its local data through Chrome. For access to, correction of, or deletion of your Supabase member record, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`,
  },
  {
    id: "children-changes",
    title: "Children and policy changes",
    body: `GoPaste is not directed to children under 13 and does not knowingly collect their personal information. If this policy changes, the updated version will be posted at this address with a new “Last updated” date.`,
  },
  {
    id: "contact",
    title: "Contact",
    body: `For questions about this policy or your data, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`,
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
        <p class="local-signal"><span aria-hidden="true"></span> Clear data boundaries</p>
        <h1 id="page-title">Your media stays local.</h1>
        <p class="lede">
          GoPaste keeps saved images and GIFs on your device. Its separately labeled
          CodeChum assistant uses Supabase sign-in and sends selected challenge details
          to Gemini only after you choose to use it.
        </p>
      </div>
      <aside class="privacy-promise" aria-label="GoPaste privacy promise">
        <span class="privacy-promise__icon" aria-hidden="true">✓</span>
        <div>
          <strong>Local media library</strong>
          <p>Images and library data live in your Chrome profile.</p>
        </div>
      </aside>
    </section>

    <section class="policy-layout" id="policy" aria-label="Privacy Policy">
      <aside class="policy-aside">
        <p>Privacy Policy</p>
        <time datetime="2026-10-25">Last updated October 25, 2026</time>
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
          <h2>Two features, with distinct data flows.</h2>
          <p>
            This policy explains the local image library and the optional CodeChum assistant,
            what each handles, and which actions send data to outside services.
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
    <p>GoPaste includes a local media library and a CodeChum assistant. Contact: ${CONTACT_EMAIL}</p>
    <a href="#top">Back to top ↑</a>
  </footer>
`;
