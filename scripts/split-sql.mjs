export function splitSqlStatements(source) {
  const statements = [];
  let statement = "";
  let state = "normal";
  let blockDepth = 0;
  let dollarTag = "";

  const push = () => {
    const value = statement.trim();
    if (value) statements.push(value);
    statement = "";
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (state === "line-comment") {
      statement += char;
      if (char === "\n") state = "normal";
      continue;
    }

    if (state === "block-comment") {
      statement += char;
      if (char === "/" && next === "*") {
        statement += next;
        blockDepth += 1;
        i += 1;
      } else if (char === "*" && next === "/") {
        statement += next;
        blockDepth -= 1;
        i += 1;
        if (blockDepth === 0) state = "normal";
      }
      continue;
    }

    if (state === "single-quote") {
      statement += char;
      if (char === "'" && next === "'") {
        statement += next;
        i += 1;
      } else if (char === "'" && !isEscapeString(source, i)) {
        state = "normal";
      } else if (char === "\\" && isEscapeString(source, i) && next !== undefined) {
        statement += next;
        i += 1;
      }
      continue;
    }

    if (state === "double-quote") {
      statement += char;
      if (char === '"' && next === '"') {
        statement += next;
        i += 1;
      } else if (char === '"') {
        state = "normal";
      }
      continue;
    }

    if (state === "dollar-quote") {
      if (source.startsWith(dollarTag, i)) {
        statement += dollarTag;
        i += dollarTag.length - 1;
        state = "normal";
      } else {
        statement += char;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      statement += char + next;
      i += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      statement += char + next;
      i += 1;
      state = "block-comment";
      blockDepth = 1;
    } else if (char === "'") {
      statement += char;
      state = "single-quote";
    } else if (char === '"') {
      statement += char;
      state = "double-quote";
    } else if (char === "$") {
      const match = source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        statement += dollarTag;
        i += dollarTag.length - 1;
        state = "dollar-quote";
      } else {
        statement += char;
      }
    } else if (char === ";") {
      push();
    } else {
      statement += char;
    }
  }

  if (state === "single-quote" || state === "double-quote" || state === "block-comment" || state === "dollar-quote") {
    throw new Error(`Unterminated SQL ${state.replace("-", " ")} in migration.`);
  }

  push();
  return statements;
}

function isEscapeString(source, quoteIndex) {
  let index = quoteIndex - 1;
  while (index >= 0 && /[A-Za-z]/.test(source[index])) index -= 1;
  const prefix = source.slice(index + 1, quoteIndex);
  if (prefix.length !== 1 || !/[eE]/.test(prefix)) return false;
  return index < 0 || !/[A-Za-z0-9_$]/.test(source[index]);
}
