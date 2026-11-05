import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "vite";
const [mode = "validate", file = process.env.STORY_FILE || ""] =
  process.argv.slice(2);
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true },
  appType: "custom",
});
// Map JSON paths to source positions without executing any author code.
function positions(text) {
  let i = 0;
  const out = new Map();
  const ws = () => {
    while (/\s/.test(text[i] || "") && i < text.length) i++;
  };
  const str = () => {
    const a = i++;
    while (i < text.length) {
      if (text[i++] === '"') break;
      if (text[i - 1] === "\\") i++;
    }
    return JSON.parse(text.slice(a, i));
  };
  function value(p) {
    ws();
    out.set(p, i);
    if (text[i] === "{") {
      i++;
      ws();
      while (text[i] !== "}") {
        const key = str();
        ws();
        i++;
        value(p ? p + "." + key : key);
        ws();
        if (text[i] !== ",") break;
        i++;
        ws();
      }
      i++;
    } else if (text[i] === "[") {
      i++;
      ws();
      let n = 0;
      while (text[i] !== "]") {
        value(p + "." + n++);
        ws();
        if (text[i] !== ",") break;
        i++;
        ws();
      }
      i++;
    } else if (text[i] === '"') str();
    else {
      while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    }
  }
  value("");
  return out;
}
function report(name, json, e, lineOffset = 0) {
  let map = new Map();
  try {
    map = positions(json);
  } catch {}
  const issues = e.issues?.map((i) => ({
    field: i.path.join("."),
    message: i.message,
  })) || [{ field: e.field || "", message: e.message }];
  for (const issue of issues) {
    let field = issue.field;
    while (!map.has(field) && field.includes("."))
      field = field.slice(0, field.lastIndexOf("."));
    const syntaxPosition = /position (\d+)/.exec(issue.message);
    const pos = syntaxPosition
      ? Number(syntaxPosition[1])
      : map.get(field) || 0;
    const line = json.slice(0, pos).split("\n").length + lineOffset;
    console.error(`${name}:${line} [${issue.field || "$"}] ${issue.message}`);
  }
  process.exitCode = 1;
}
async function readStory(source) {
  let text = "",
    json = "",
    lineOffset = 0;
  text = await readFile(source, "utf8");
  if (Buffer.byteLength(text) > 100 * 1024 * 1024)
    throw Error("脚本不能超过100MB");
  json = text;
  if (/\.md$/i.test(source)) {
    const match = /```json\s*\n([\s\S]*?)```/.exec(text);
    if (!match)
      throw Error(
        "Markdown 需要一个 ```json 剧情数据块；自然语言由创作 AI 转换，不在运行时调用 AI",
      );
    json = match[1];
    lineOffset =
      text.slice(0, match.index + match[0].indexOf(match[1])).split("\n").length -
      1;
  }
  return { json, lineOffset };
}
const { compileStory, storySchema } = await server.ssrLoadModule(
  "/src/story-engine/compiler.ts",
);
const { testStory } = await server.ssrLoadModule(
  "/src/story-engine/testStory.ts",
);
async function storyDirs() {
  const entries = await readdir("stories", { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}
async function compileOne(source, options = {}) {
  const { json, lineOffset } = await readStory(source);
  try {
    const raw = JSON.parse(json);
    const { story, work } = compileStory(raw);
    if (options.test) {
      const errors = testStory(story, work);
      if (errors.length) throw Error(errors.join("\n"));
    }
    return { story, work };
  } catch (e) {
    report(source, json, e, lineOffset);
    return null;
  }
}
function summary(source, work, story) {
  console.log(
    `${source}: ${mode} 通过 (${work.apps.filter((a) => a.installed).length} Apps, ${Object.values(work.data).flat().length} records, ${work.nodes.length} events, ${story.tests.length} paths)`,
  );
}
try {
  if (mode === "schema") {
    const { z } = await import("zod");
    await mkdir("schemas", { recursive: true });
    await writeFile(
      "schemas/story.schema.json",
      JSON.stringify(z.toJSONSchema(storySchema), null, 2) + "\n",
    );
  } else if (mode === "validate" || mode === "test") {
    // 无参数时校验 stories/ 下的全部故事，保证新增故事同样进入流水线。
    const targets = file
      ? [file]
      : (await storyDirs()).map((d) => join("stories", d, "story.json"));
    for (const target of targets) {
      const compiled = await compileOne(target, { test: mode === "test" });
      if (compiled) summary(target, compiled.work, compiled.story);
    }
  } else if (mode === "build") {
    const main = file || process.env.STORY_FILE || "stories/xiuning-kai/story.json";
    const built = await compileOne(main, { test: true });
    if (!built) throw Error("故事编译失败");
    await mkdir("public", { recursive: true });
    await writeFile("public/work.json", JSON.stringify(built.work, null, 2) + "\n");
    const blank = compileStory(
      JSON.parse(await readFile("stories/blank/story.json", "utf8")),
    ).work;
    await writeFile(
      "public/blank-work.json",
      JSON.stringify(blank, null, 2) + "\n",
    );
    {
      const preview = compileStory(
        JSON.parse(await readFile("stories/test-preview/story.json", "utf8")),
      ).work;
      await writeFile(
        "public/test-work.json",
        JSON.stringify(preview, null, 2) + "\n",
      );
    }
    // 其余故事目录各自产出一份作品文件，可用 ?story=<目录> 打开。
    const reserved = ["blank", "template", "test-preview"];
    const extra = (await storyDirs()).filter((d) => !reserved.includes(d));
    if (extra.length) await mkdir("public/stories", { recursive: true });
    for (const dir of extra) {
      const source = join("stories", dir, "story.json");
      const compiled = await compileOne(source, { test: true });
      if (!compiled) throw Error("故事编译失败: " + source);
      await writeFile(
        join("public/stories", dir + ".json"),
        JSON.stringify(compiled.work, null, 2) + "\n",
      );
      summary(source, compiled.work, compiled.story);
    }
  } else throw Error("未知命令 " + mode);
} catch (e) {
  report(file || mode, "", e);
} finally {
  await server.close();
}
