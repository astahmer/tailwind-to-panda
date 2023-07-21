import { createMergeCss } from "@pandacss/shared";
import { cac } from "cac";
import { readFileSync } from "fs";
import { join, resolve } from "pathe";
import { initialInputList } from "../../../demo-code-sample";
import { extractTwFileClassList } from "./extract-tw-class-list";
import { PandaContext, createPandaContext } from "./panda-context";
import { rewriteTwFileContentToPanda } from "./rewrite-tw-file-content-to-panda";
import { createTailwindContext } from "./tw-context";
import { twClassListToPanda } from "./tw-to-panda";
import { z } from "zod";
import { bundle } from "./bundle";

import { loadConfigAndCreateContext } from "@pandacss/node";

// @ts-expect-error
import { name, version } from "../package.json";
import { writeFile } from "fs/promises";
import { RewriteOptions } from "./types";

const cwd = process.cwd();

const withTw = z.object({ tailwind: z.string() });
const withWrite = z.object({ write: z.boolean() });
const rewriteOptions = z.object({ shorthands: z.boolean() }).partial();
const configOptions = z.object({ config: z.string().optional(), cwd: z.string().default(cwd) });

const rewriteFlags = withWrite.merge(withTw).merge(rewriteOptions).partial().merge(configOptions);
const extractFlags = withWrite.merge(withTw).merge(rewriteOptions).partial().merge(configOptions);

const cli = cac(name);

cli
  .command("rewrite <glob>", "Output the given file converted to panda, doesn't actually write to disk unless using -w")
  .option("--tw, --tailwind <file>", "Path to tailwind.config.js")
  .option("-w, --write", "Write to disk instead of stdout")
  .option("-s, --shorthands", "Use shorthands instead of longhand properties")
  .option("-c, --config <path>", "Path to panda config file")
  .option("--cwd <cwd>", "Current working directory", { default: cwd })
  .action(async (file, _options) => {
    const options = rewriteFlags.parse(_options);
    const cwd = resolve(options.cwd);
    const content = readFileSync(join(cwd, file), "utf-8");

    let twConfig = initialInputList["tailwind.config.js"];
    if (options.tailwind) {
      twConfig = (await bundle(join(cwd, options.tailwind), cwd)).config as any;
    }

    const tw = createTailwindContext(twConfig);
    const configPath = options.config;

    const panda = configPath
      ? ((await loadConfigAndCreateContext({ configPath, cwd })) as any as PandaContext)
      : createPandaContext();
    const { mergeCss } = createMergeCss(Object.assign(panda, { hash: false }));

    const result = rewriteTwFileContentToPanda(content, tw.context, panda, mergeCss, options as RewriteOptions);
    if (options.write) {
      return await writeFile(join(cwd, file), result.output);
    }

    console.log(result.output);
  });

cli
  .command(
    "extract <file>",
    "Extract each tailwind candidate and show its converted output, doesn't actually write to disk",
  )
  .option("--tw, --tailwind <file>", "Path to tailwind.config.js")
  .option("-s, --shorthands", "Use shorthands instead of longhand properties")
  .action(async (file, _options) => {
    const options = extractFlags.parse(_options);
    const content = readFileSync(join(cwd, file), "utf-8");

    let twConfig = initialInputList["tailwind.config.js"];
    if (options.tailwind) {
      twConfig = (await bundle(join(cwd, options.tailwind), cwd)).config as any;
    }

    const tw = createTailwindContext(twConfig);
    const configPath = options.config;

    const panda = configPath
      ? ((await loadConfigAndCreateContext({ configPath, cwd })) as any as PandaContext)
      : createPandaContext();
    const { mergeCss } = createMergeCss(Object.assign(panda, { hash: false }));

    const list = extractTwFileClassList(content, tw.context, panda, mergeCss, options as RewriteOptions);
    console.log(list.map(({ node, ...item }) => item));
  });

cli
  .command("convert <classList>", "Example: inline-flex disabled:pointer-events-none underline-offset-4")
  .option("-s, --shorthands", "Use shorthands instead of longhand properties")
  .action((classList, _options) => {
    const options = rewriteOptions.partial().parse(_options);
    const result = twClassListToPanda(classList, options);
    console.log("input:", classList);
    console.log("output:\n");
    console.log(JSON.stringify(result, null, 2));
  });

cli.help();
cli.version(version);
cli.parse();
