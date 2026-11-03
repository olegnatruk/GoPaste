/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
// @ts-nocheck — self-contained injected functions ported from the standalone extension.
/* These self-contained functions are serialized into the active tab by chrome.scripting. */
const CodeChumPage = {
  readProblem: async function readProblem(quickResults = false) {
    const text = (element) => element?.innerText?.trim() || element?.textContent?.trim() || "";
    const details =
      document.querySelector('#answerDetails, [data-testid="answerDetails"]') || document;
    const titleEl =
      details.querySelector(".styles_text___heading___xs__Qdbcu.styles_text___n___700__ekgLG") ||
      details.querySelector("[class*='styles_text___heading'], h1, h2");
    const descEl = details.querySelector(
      ".styles_description__sQT3h, [class*='styles_description']",
    );
    const langEl = document.querySelector(
      ".styles_text___n___700__ekgLG.undefined, select.language-select, [class*='language']",
    );
    const itemEl = details.querySelector(
      ".styles_text___label___md__ddwd1.styles_text___n___700__ekgLG, [class*='styles_text___label']",
    );
    const title = text(titleEl);
    const description = text(descEl);
    const language = langEl?.value || text(langEl) || "Java";
    const itemNumber = Number(text(itemEl).match(/\d+/)?.[0]) || 1;
    const fileTabs = [
      ...document.querySelectorAll('#answerEditor button[data-testid="tabButton"]'),
    ].filter((button) => /\.[a-z0-9]+$/i.test(button.getAttribute("aria-label") || ""));
    const activeFile =
      fileTabs.find((button) => /active/.test(button.className))?.getAttribute("aria-label") || "";
    const requirementSelector =
      "[class*='minimumRequirement'], [class*='minimum_requirement'], [class*='minimum-requirement'], [data-testid*='requirement'], [class*='requirements']";
    const requirementEl =
      details.querySelector(requirementSelector) ||
      (details !== document ? document.querySelector(requirementSelector) : null);
    const lines = (details.innerText || details.textContent || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim());
    const sectionStart = lines.findIndex((line) => /^Minimum Requirements?\s*:?/i.test(line));
    const boundary =
      /^(?:Sample (?:Input|Output)|Examples?|Tests?|Test Cases|Notes?|Hints?|Constraints)\b/i;
    const section = [];
    if (sectionStart >= 0) {
      const inline = lines[sectionStart].replace(/^Minimum Requirements?\s*:?\s*/i, "");
      if (inline) section.push(inline);
      for (let index = sectionStart + 1; index < lines.length && section.length < 30; index++) {
        if (boundary.test(lines[index])) break;
        if (lines[index]) section.push(lines[index]);
      }
    }
    // Some items show the constraint cards directly, with "Should use" and
    // "Method ..." but no visible "Minimum Requirements" heading.
    const cards = [];
    for (let index = 0; index < lines.length; index++) {
      if (!/^Should\s+(?:not\s+)?use\s*:/i.test(lines[index])) continue;
      const card = [lines[index]];
      for (let next = index + 1; next < lines.length && card.length < 3; next++) {
        if (!lines[next]) continue;
        if (
          /^Should\s+(?:not\s+)?use\s*:|^Minimum Requirements?\b/i.test(lines[next]) ||
          boundary.test(lines[next])
        )
          break;
        if (
          !/^(?:Method|Function|Class|Loop|Variable|Operator|Data Structure)\b/i.test(
            lines[next],
          ) &&
          !(
            /^Method\s*:?$/i.test(card[card.length - 1]) && /^public\s|^static\s/i.test(lines[next])
          )
        )
          break;
        card.push(lines[next]);
      }
      cards.push(card.join(" "));
    }
    let requirements = text(requirementEl);
    if (/^Minimum Requirements?\s*:?$/i.test(requirements)) requirements = "";
    const extracted = section.length ? section.join("\n") : cards.join("\n");
    if (extracted && (!requirements || extracted.length > requirements.length))
      requirements = extracted;
    const compact = (value) => value.replace(/\s+/g, " ").trim();
    for (const card of cards) {
      if (!compact(requirements).includes(compact(card)))
        requirements += (requirements ? "\n" : "") + card;
    }
    requirements = requirements.slice(0, 5000);

    const tab = [...document.querySelectorAll('[role="tab"], button')].find((el) =>
      /^Tests(?:\s*\(\d+\))?$/i.test(text(el)),
    );
    if (tab && tab.getAttribute("aria-selected") !== "true") {
      tab.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    // CodeChum's current Tests tab uses one expandable button per card. Read each
    // card immediately after opening it because opening another may collapse it.
    let testButtons = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')];
    const testsDeadline = Date.now() + 2000;
    while (!testButtons.length && tab && Date.now() < testsDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      testButtons = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')];
    }
    // Current CodeChum renders minimum requirements in the right-hand Tests
    // panel, outside #answerDetails. Read the actual cards after opening Tests.
    let requirementCards = [
      ...document.querySelectorAll('#answerTests [data-testid="problemMinimumRequirementCard"]'),
    ];
    const testsRoot = document.querySelector("#answerTests");
    const requirementsDeadline = Date.now() + 600;
    while (
      !requirementCards.length &&
      /Minimum Requirements/i.test(testsRoot?.innerText || "") &&
      Date.now() < requirementsDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      requirementCards = [
        ...document.querySelectorAll('#answerTests [data-testid="problemMinimumRequirementCard"]'),
      ];
    }
    const requirementBlocks = requirementCards
      .map((card, index) => ({
        number: index + 1,
        text: text(card.querySelector('[data-testid="functionName"]')) || text(card),
        status: card.querySelector('[aria-label="check_circle"]')
          ? "passed"
          : card.querySelector('[aria-label="cancel"]')
            ? "failed"
            : "unchecked",
      }))
      .filter((block) => block.text);
    if (requirementBlocks.length)
      requirements = requirementBlocks
        .map((block) => block.text)
        .join("\n")
        .slice(0, 5000);
    if (testButtons.length) {
      const caseBlocks = [];
      const field = (card, label) => {
        const title = [...card.querySelectorAll("p,span,div")].find(
          (el) =>
            el.children.length === 0 &&
            (el.textContent || "").trim().toLowerCase() === label.toLowerCase(),
        );
        const value = title?.nextElementSibling;
        return value ? (value.textContent || "").replace(/\r\n?/g, "\n") : null;
      };
      const initiallyOpen = testButtons
        .find((button) => button.querySelector('[aria-label="arrow_drop_up"]'))
        ?.getAttribute("aria-label");
      for (const original of testButtons) {
        const label = original.getAttribute("aria-label");
        let button = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')].find(
          (candidate) => candidate.getAttribute("aria-label") === label,
        );
        if (!button) continue;
        if (button.querySelector('[aria-label="arrow_drop_down"]')) {
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 120));
          button =
            [...document.querySelectorAll('button[aria-label^="Open Test Case"]')].find(
              (candidate) => candidate.getAttribute("aria-label") === label,
            ) || button;
        }
        const card =
          button.closest('[class*="styles_card__"]') || button.parentElement?.parentElement;
        if (!card) continue;
        if (!quickResults) {
          const outputDeadline = Date.now() + 1000;
          while (field(card, "Expected Output") === null && Date.now() < outputDeadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        const number = Number(label.match(/\d+/)?.[0]);
        const testDescription =
          button.querySelector('[class*="styles_innerhtml"]')?.innerText?.trim() || "";
        const status = button.querySelector('[aria-label="check_circle"]')
          ? "passed"
          : button.querySelector('[aria-label="cancel"]')
            ? "failed"
            : "unchecked";
        caseBlocks.push({
          number,
          description: testDescription,
          status,
          text: card.innerText || "",
          input: field(card, "Input"),
          expectedOutput: field(card, "Expected Output"),
          yourOutput: field(card, "Your Output"),
        });
      }
      if (initiallyOpen) {
        const button = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')].find(
          (candidate) => candidate.getAttribute("aria-label") === initiallyOpen,
        );
        if (button?.querySelector('[aria-label="arrow_drop_down"]')) button.click();
      }
      return {
        url: location.href,
        title,
        description,
        language,
        itemNumber,
        activeFile,
        fileCount: fileTabs.length,
        requirements,
        requirementBlocks,
        caseBlocks,
        testsText: caseBlocks
          .map((block) => block.text)
          .join("\n\n")
          .slice(0, 50000),
        visibleCaseCount: testButtons.length,
      };
    }

    const visible = (el) =>
      !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    const headingElements = [
      ...document.querySelectorAll("h1,h2,h3,h4,h5,h6,button,span,div,p"),
    ].filter(
      (el) =>
        visible(el) &&
        /^Test\s*Case\s*#?\s*\d+$/i.test(text(el)) &&
        ![...el.children].some((child) => /^Test\s*Case\s*#?\s*\d+$/i.test(text(child))),
    );

    for (const heading of headingElements) {
      const toggle = heading.closest("button,[aria-expanded]");
      if (toggle?.getAttribute("aria-expanded") === "false") toggle.click();
    }
    if (headingElements.some((el) => el.closest('[aria-expanded="true"]'))) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    function field(card, label) {
      const labelPattern =
        label === "input"
          ? /^(?:Sample\s+)?Input\s*:?$/i
          : label === "yourOutput"
            ? /^Your\s+Output\s*:?$/i
            : /^Expected\s+Output\s*:?$/i;
      const labels = [...card.querySelectorAll("div,span,p,strong,b,label,h4,h5,h6")].filter(
        (el) =>
          labelPattern.test(text(el)) &&
          ![...el.children].some((child) => labelPattern.test(text(child))),
      );
      for (const labelEl of labels) {
        for (const valueEl of [
          labelEl.nextElementSibling,
          labelEl.parentElement?.nextElementSibling,
        ]) {
          if (!valueEl || !visible(valueEl)) continue;
          const value =
            valueEl.querySelector("pre,code")?.textContent ??
            valueEl.innerText ??
            valueEl.textContent;
          if (
            value != null &&
            value.trim() &&
            value.length < 12000 &&
            !/^(?:Input|Expected Output|Your Output)\s*:?$/i.test(value.trim())
          ) {
            return value.replace(/\r\n?/g, "\n");
          }
        }
      }
      return null;
    }

    const caseBlocks = [];
    const seen = new Set();
    for (const heading of headingElements) {
      const number = Number(text(heading).match(/\d+/)?.[0]);
      if (!number || seen.has(number)) continue;
      let card = heading;
      for (
        let parent = heading.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const parentText = text(parent);
        if (/\bExpected\s+Output\b/i.test(parentText) && parentText.length < 18000) {
          card = parent;
          break;
        }
      }
      caseBlocks.push({
        number,
        text: card.innerText || card.textContent || "",
        input: field(card, "input"),
        expectedOutput: field(card, "output"),
        yourOutput: field(card, "yourOutput"),
      });
      seen.add(number);
    }

    let testsPanel = null;
    const controlledId = tab?.getAttribute("aria-controls");
    if (controlledId) testsPanel = document.getElementById(controlledId);
    if (!testsPanel) testsPanel = [...document.querySelectorAll('[role="tabpanel"]')].find(visible);
    if (!testsPanel && headingElements.length)
      testsPanel = headingElements[0].closest('[class*="tests"], [class*="Tests"], aside');
    const testsText = (
      testsPanel?.innerText || caseBlocks.map((block) => block.text).join("\n\n")
    ).slice(0, 50000);

    return {
      url: location.href,
      title,
      description,
      language,
      itemNumber,
      activeFile,
      fileCount: fileTabs.length,
      requirements,
      requirementBlocks,
      caseBlocks,
      testsText,
      visibleCaseCount: headingElements.length,
    };
  },

  getIdentity: function getIdentity() {
    const details =
      document.querySelector('#answerDetails, [data-testid="answerDetails"]') || document;
    const titleEl =
      details.querySelector(".styles_text___heading___xs__Qdbcu.styles_text___n___700__ekgLG") ||
      details.querySelector("[class*='styles_text___heading'], h1, h2");
    const descEl = details.querySelector(
      ".styles_description__sQT3h, [class*='styles_description']",
    );
    const itemEl = details.querySelector(
      ".styles_text___label___md__ddwd1.styles_text___n___700__ekgLG, [class*='styles_text___label']",
    );
    const activeFile =
      document
        .querySelector('#answerEditor button[data-testid="tabButton"][class*="active"]')
        ?.getAttribute("aria-label") || "";
    return {
      url: location.href,
      title: titleEl?.innerText?.trim() || titleEl?.textContent?.trim() || "",
      description: descEl?.innerText?.trim() || descEl?.textContent?.trim() || "",
      itemNumber:
        Number((itemEl?.innerText || itemEl?.textContent || "").match(/\d+/)?.[0]) || null,
      activeFile,
    };
  },

  readEditorCode: function readEditorCode() {
    const aceEl = document.querySelector(".ace_editor");
    const editor = aceEl?.env?.editor || (window.ace && aceEl ? window.ace.edit(aceEl) : null);
    return editor?.getValue() || "";
  },

  readTestResult: function readTestResult(number) {
    const button = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')].find(
      (candidate) => Number(candidate.getAttribute("aria-label")?.match(/\d+/)?.[0]) === number,
    );
    if (!button) return { completed: false, error: `Test case ${number} disappeared.` };
    const card =
      button.closest('[data-testid="testCaseCard"]') || button.closest('[class*="styles_card__"]');
    if (!card) return { completed: false, error: `Test case ${number} card disappeared.` };
    const status = button.querySelector('[aria-label="check_circle"]')
      ? "passed"
      : button.querySelector('[aria-label="cancel"]')
        ? "failed"
        : "pending";
    const runButton = card.querySelector('button[aria-label="Run this test"]');
    const busy =
      runButton?.disabled ||
      runButton?.getAttribute("aria-disabled") === "true" ||
      /\bChecking\.\.\./.test(document.body?.innerText || "");
    const field = (label) => {
      const heading = [...card.querySelectorAll("p")].find(
        (el) => (el.textContent || "").trim() === label,
      );
      return heading?.nextElementSibling?.textContent?.replace(/\r\n?/g, "\n") ?? null;
    };
    return {
      completed: !busy && (status === "passed" || status === "failed"),
      passed: status === "passed",
      status,
      yourOutput: field("Your Output"),
      expectedOutput: field("Expected Output"),
      description: button.querySelector('[class*="styles_innerhtml"]')?.innerText?.trim() || "",
    };
  },

  readResult: async function readResult() {
    const visible = (el) =>
      !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
    const signals =
      /Perfect!|You Passed|You Failed|Score must be perfect|See what(?:'|’)s wrong|Compilation Error|Runtime Error/i;
    const resultAction = [...document.querySelectorAll("button")].some(
      (el) => visible(el) && /^Re-solve$/i.test((el.innerText || el.textContent || "").trim()),
    );
    if (!resultAction) return { raw: "" };
    const dialogs = [
      ...document.querySelectorAll(
        '[role="dialog"], [class*="modal"], [class*="Modal"], [class*="result"], [class*="Result"]',
      ),
    ]
      .filter(
        (el) =>
          visible(el) &&
          signals.test(el.innerText || "") &&
          [...el.querySelectorAll("button")].some((button) =>
            /^Re-solve$/i.test((button.innerText || button.textContent || "").trim()),
          ),
      )
      .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
    const root = dialogs[0] || document.body;
    const detailButtons = [...root.querySelectorAll("button")].filter(
      (el) =>
        visible(el) &&
        /^See what(?:'|’)s wrong$/i.test((el.innerText || el.textContent || "").trim()),
    );
    for (const button of detailButtons) {
      if (button.getAttribute("aria-expanded") !== "true") button.click();
    }
    if (detailButtons.length) await new Promise((resolve) => setTimeout(resolve, 100));
    const modalText = (root.innerText || "").slice(0, 5000);
    if (!signals.test(modalText)) return { raw: "" };
    if (/Perfect!/i.test(modalText)) return { raw: modalText };

    const caseButtons = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')];
    const initiallyOpen = caseButtons
      .find((button) => button.querySelector('[aria-label="arrow_drop_up"]'))
      ?.getAttribute("aria-label");
    const details = [];
    for (const original of caseButtons) {
      const label = original.getAttribute("aria-label");
      let button = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')].find(
        (candidate) => candidate.getAttribute("aria-label") === label,
      );
      if (!button) continue;
      if (button.querySelector('[aria-label="arrow_drop_down"]')) {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        button =
          [...document.querySelectorAll('button[aria-label^="Open Test Case"]')].find(
            (candidate) => candidate.getAttribute("aria-label") === label,
          ) || button;
      }
      const card =
        button.closest('[class*="styles_card__"]') || button.parentElement?.parentElement;
      if (card) details.push((card.innerText || "").slice(0, 5000));
    }
    if (initiallyOpen) {
      const button = [...document.querySelectorAll('button[aria-label^="Open Test Case"]')].find(
        (candidate) => candidate.getAttribute("aria-label") === initiallyOpen,
      );
      if (button?.querySelector('[aria-label="arrow_drop_down"]')) button.click();
    }
    return {
      raw: (modalText + "\n\nChecked test details:\n" + details.join("\n\n")).slice(0, 20000),
    };
  },

  prepareRetry: async function prepareRetry() {
    const text = (element) => (element?.innerText || element?.textContent || "").trim();
    const button = [...document.querySelectorAll("button")].find(
      (el) => /^Re-solve$/i.test(text(el)) && el.getClientRects().length,
    );
    if (button) {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const editor = document.querySelector(".ace_editor");
      const resultModal = document.querySelector('[data-testid="executionResultsModal"]');
      if (editor?.getClientRects().length && !resultModal?.getClientRects().length)
        return { ready: true };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { ready: false, error: "CodeChum editor did not reopen after checking." };
  },

  restoreCode: function restoreCode(code) {
    const aceEl = document.querySelector(".ace_editor");
    const editor = aceEl?.env?.editor || (window.ace && aceEl ? window.ace.edit(aceEl) : null);
    if (!editor) return { restored: false };
    editor.setValue(code, 1);
    aceEl.dispatchEvent(new Event("input", { bubbles: true }));
    aceEl.dispatchEvent(new Event("change", { bubbles: true }));
    return { restored: true };
  },
};

export { CodeChumPage };
