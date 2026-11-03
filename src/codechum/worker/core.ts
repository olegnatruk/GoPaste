/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
// @ts-nocheck — kept in lockstep with the standalone solver's tested parser.
/* eslint-disable */
/* Shared, side-effect-free parsing and prompt helpers for the CodeChum solver. */
const CodeChumCore = (() => {
  const normalizeNewlines = (value) => String(value || "").replace(/\r\n?/g, "\n");

  function parseCaseText(text) {
    const raw = normalizeNewlines(text);
    const input = raw.match(
      /(?:^|\n)[ \t]*(?:Sample[ \t]+)?Input[ \t]*:?[ \t]*(?:\n|(?=\S))([\s\S]*?)(?=\n[ \t]*(?:Expected[ \t]+Output|Output)[ \t]*:?[ \t]*(?:\n|\S))/i,
    );
    const output = raw.match(
      /(?:^|\n)[ \t]*Expected[ \t]+Output[ \t]*:?[ \t]*(?:\n|(?=\S))([\s\S]*?)(?=\n[ \t]*(?:Your[ \t]+Output|Run[ \t]+this[ \t]+test|See[ \t]+what(?:'|’)s[ \t]+wrong|Test[ \t]*Case[ \t]*#?[ \t]*\d+|Status|Score)\b|$)/i,
    );
    return {
      input: input ? input[1].replace(/^\n/, "").replace(/\n+$/, "") : "",
      expectedOutput: output ? output[1].replace(/^\n/, "").replace(/\n+$/, "") : "",
      hasInput: !!input,
      hasExpectedOutput: !!output,
    };
  }

  function extractCases(problem) {
    const blocks = Array.isArray(problem.caseBlocks) ? problem.caseBlocks : [];
    const cases = blocks
      .map((block, index) => {
        const parsed = parseCaseText(block.text);
        return {
          number: Number(block.number) || index + 1,
          description: block.description || "",
          input:
            block.input != null
              ? normalizeNewlines(block.input)
              : parsed.hasInput
                ? parsed.input
                : null,
          expectedOutput:
            block.expectedOutput != null
              ? normalizeNewlines(block.expectedOutput)
              : parsed.expectedOutput,
          complete: block.expectedOutput != null || parsed.hasExpectedOutput,
        };
      })
      .filter((item) => item.complete);

    if (!cases.length && problem.testsText) {
      const chunks = normalizeNewlines(problem.testsText).split(
        /(?=^\s*Test\s*Case\s*#?\s*\d+\b)/gim,
      );
      for (const chunk of chunks) {
        if (!/^\s*Test\s*Case\s*#?\s*\d+/i.test(chunk)) continue;
        const parsed = parseCaseText(chunk);
        if (parsed.hasExpectedOutput) {
          const number = Number(chunk.match(/Test\s*Case\s*#?\s*(\d+)/i)?.[1]) || cases.length + 1;
          cases.push({
            number,
            description: "",
            input: parsed.hasInput ? parsed.input : null,
            expectedOutput: parsed.expectedOutput,
            complete: true,
          });
        }
      }
    }

    const unique = new Map();
    for (const item of cases) unique.set(item.number, item);
    return [...unique.values()].sort((a, b) => a.number - b.number);
  }

  function fingerprint(problem) {
    const source = JSON.stringify([
      problem.url,
      problem.itemNumber,
      problem.title,
      problem.description,
      problem.activeFile,
      problem.requirements,
      problem.language,
      problem.testCases,
    ]);
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function caseContext(problem) {
    if (!problem.testCases.length)
      return "No complete test cases could be read from the Tests tab.";
    return problem.testCases
      .map(
        (test) =>
          `Test case ${test.number}\nTest description:\n${test.description || "None shown"}\n` +
          (test.input === null ? "No explicit input shown.\n" : `Input:\n${test.input}\n`) +
          `Expected Output (preserve spacing and line breaks):\n${test.expectedOutput}`,
      )
      .join("\n\n");
  }

  function problemContext(problem) {
    return `Challenge: ${problem.title}\nLanguage: ${problem.language}\nActive editor file: ${problem.activeFile || "Not shown"}\nDescription:\n${problem.description}\nMinimum requirements:\n${problem.requirements || "None shown"}\n\nVisible test cases:\n${caseContext(problem)}`;
  }

  function requiredMethodSignatures(requirements) {
    const plain = normalizeNewlines(requirements).replace(/\*\*/g, "");
    const matches = [
      ...plain.matchAll(
        /Should\s+use\s*:?\s*Method\s*:?\s+([A-Za-z_$][\w$<>,?.\[\]\s]*?\([^)]*\))/gi,
      ),
    ];
    return [...new Set(matches.map((match) => match[1].replace(/\s+/g, " ").trim()))];
  }

  function splitParameters(value) {
    const parameters = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < value.length; index++) {
      if (value[index] === "<") depth++;
      else if (value[index] === ">") depth--;
      else if (value[index] === "," && depth === 0) {
        parameters.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    const last = value.slice(start).trim();
    if (last) parameters.push(last);
    return parameters;
  }

  function normalizedType(value) {
    return value.replace(/\s+/g, "").replace(/\.\.\./g, "[]");
  }

  function missingRequiredMethods(requirements, code) {
    const withoutComments = String(code || "").replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
      (fragment) => fragment.replace(/[^\n]/g, " "),
    );
    return requiredMethodSignatures(requirements).filter((signature) => {
      const required = signature.match(/^(.+?)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)$/);
      if (!required) return false; // Leave unfamiliar syntax to CodeChum's checker.
      const prefix = required[1].trim().split(/\s+/);
      const returnType = normalizedType(prefix.pop());
      const modifiers = prefix.map((token) => token.toLowerCase());
      const parameterTypes = splitParameters(required[3]).map(normalizedType);
      const name = required[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const declaration = new RegExp(
        `\\b((?:(?:public|private|protected|static|final|synchronized|native|strictfp)\\s+)*)` +
          `([\\w.$<>?,\\[\\]]+)\\s+${name}\\s*\\(([^)]*)\\)\\s*(?:throws\\s+[\\w$.,\\s]+)?\\{`,
        "g",
      );
      for (const found of withoutComments.matchAll(declaration)) {
        const actualModifiers = found[1].trim().toLowerCase().split(/\s+/);
        if (!modifiers.every((token) => actualModifiers.includes(token))) continue;
        if (normalizedType(found[2]) !== returnType) continue;
        const actualTypes = splitParameters(found[3]).map((parameter) => {
          const clean = parameter
            .replace(/@[A-Za-z_$][\w$]*(?:\([^)]*\))?\s*/g, "")
            .replace(/\bfinal\s+/g, "")
            .trim();
          const named = clean.match(/^(.+?)\s+([A-Za-z_$][\w$]*)(\s*(?:\[\s*\])*)$/);
          return normalizedType(named ? named[1] + named[3] : clean);
        });
        if (
          actualTypes.length === parameterTypes.length &&
          actualTypes.every((type, index) => type === parameterTypes[index])
        )
          return false;
      }
      return true;
    });
  }

  function planningPrompt(problem) {
    return `${problemContext(problem)}\n\nBefore writing code, analyze the required input format, exact output format, algorithm, edge cases, and minimum requirements. Return a concise implementation plan only. Do not assume that the visible cases cover every input.`;
  }

  function codePrompt(problem, plan, priorCode = "", feedback = "") {
    const revision = priorCode
      ? `\nPrevious code:\n${priorCode}\n\nCodeChum check feedback:\n${feedback}\n\nRepair every failing case and compilation or runtime error.`
      : feedback
        ? `\nVisible CodeChum test feedback:\n${feedback}\n\nAccount for these wrong results.`
        : "";
    const planContext = plan ? `\n\nImplementation plan:\n${plan}` : "";
    const focus = problem.focusedSelection
      ? "\nThe visible cases below are the cases selected for this run. Prioritize them while following the full problem requirements."
      : "";
    return `${problemContext(problem)}${focus}${planContext}${revision}\n\nAnalyze the input, exact output, requirements, and edge cases internally. Meet every listed minimum requirement in the code; CodeChum gives zero points when any one is unmet, even if outputs match. For every "Should use: Method" rule, declare and implement the exact named method with the required visibility, static modifier, return type, and parameter types in order. Parameter names may differ. Use that method in the solution where the problem calls for it. Write the complete code for the active editor file in ${problem.language}. Return ONLY raw code: no markdown, comments, or explanation.`;
  }

  function parseCheckResult(text) {
    const raw = normalizeNewlines(text);
    const heading = raw.trimStart().split("\n")[0].trim();
    const readFraction = (pattern) => {
      const match = raw.match(pattern);
      return match ? { earned: Number(match[1]), total: Number(match[2]) } : null;
    };
    const fraction = "\\s*:?\\s*\\n?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:\\/|out of)\\s*(\\d+(?:\\.\\d+)?)";
    const overallScore = readFraction(new RegExp(`(?:^|\\n)\\s*Score${fraction}`, "i"));
    const testCaseScore = readFraction(new RegExp(`(?:^|\\n)\\s*Test Cases${fraction}`, "i"));
    const requirementScore = readFraction(
      new RegExp(`(?:^|\\n)\\s*(?:Minimum\\s+)?Requirements?(?:\\s+Met)?${fraction}`, "i"),
    );
    const explicitFailure =
      /(?:did not meet|failed to meet|unmet|not met|missing|incomplete|failed)\s+(?:one or more\s+)?(?:of the\s+)?minimum requirements?|minimum requirements?\s*:?\s*(?:were\s+)?(?:not met|unmet|failed)/i.test(
        raw,
      );
    let requirementsMet = requirementScore
      ? requirementScore.earned >= requirementScore.total
      : explicitFailure
        ? false
        : null;
    if (requirementsMet === null && overallScore && overallScore.earned > 0) requirementsMet = true;
    if (requirementsMet === null && overallScore?.earned === 0 && testCaseScore?.earned > 0)
      requirementsMet = false;
    const passed = /^Perfect!$/i.test(heading) && requirementsMet !== false;
    const failed =
      /^(?:You (?:Passed|Failed)|Score must be perfect|Compilation Error|Runtime Error)/i.test(
        heading,
      ) || requirementsMet === false;
    const score =
      requirementsMet === false
        ? overallScore || testCaseScore
          ? { earned: 0, total: (overallScore || testCaseScore).total }
          : null
        : overallScore || testCaseScore;
    return {
      completed: passed || failed,
      passed,
      score,
      overallScore,
      testCaseScore,
      minimumRequirements: { met: requirementsMet, score: requirementScore },
      feedback: raw.slice(0, 16000),
    };
  }

  return {
    extractCases,
    fingerprint,
    planningPrompt,
    codePrompt,
    parseCheckResult,
    parseCaseText,
    requiredMethodSignatures,
    missingRequiredMethods,
  };
})();

export { CodeChumCore };
