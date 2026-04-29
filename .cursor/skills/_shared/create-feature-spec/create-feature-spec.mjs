#!/usr/bin/env node
/**
 * 在 docs/features/<slug>/ 下初始化：
 * - spec.md（需求详细阐述、分支名）
 * - plan.md（概述…技术方案、**## 方案澄清事项**（#### Qn + 勾选，与 spec ### 澄清事项形态一致、方案向）、风险、验收标准、开发任务、实现计划、代码审查；spec ### 澄清事项=需求向）
 * - source/README.md（素材：截图、线框、流程图等）
 * - prd/README.md（上游 PRD / 产品文档留存占位）
 * 及可选 architecture.md。
 *
 * 模板与脚本在 `.cursor/skills/_shared/create-feature-spec/` 公共维护；spec-creator Skill 仅引用本路径。
 * --slug / --description 可省略：使用默认目录名与占位描述。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SLUG_RE = /^[a-z][a-z0-9]*([_-][a-z0-9]+)*$/;
const DESC_MIN = 10;
const DESC_MAX = 8000;

/** 未传 --description 时写入 spec，长度满足 DESC_MIN–DESC_MAX */
const DEFAULT_DESCRIPTION =
  '请在此补充本需求的目标、范围、优先级；可测验收条目写在同目录 plan.md 的「## 验收标准」；当前为未指定 --description 时脚本生成的占位说明，可直接整段替换。';

function defaultSlug(root) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const base = `feature-${day}`;
  let candidate = base;
  let seq = 1;
  for (;;) {
    const dir = path.join(root, 'docs', 'features', candidate);
    if (!fs.existsSync(dir)) return candidate;
    seq += 1;
    candidate = `${base}-${seq}`;
  }
}

/** Git 仓库根（本脚本位于 .cursor/skills/_shared/create-feature-spec/，上溯四级） */
function repoRoot() {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function parseArgs(argv) {
  const out = {
    slug: null,
    description: null,
    title: null,
    architecture: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--architecture' || a === '--with-architecture') out.architecture = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--slug' && argv[i + 1]) out.slug = argv[++i];
    else if (a === '--description' && argv[i + 1]) out.description = argv[++i];
    else if (a === '--title' && argv[i + 1]) out.title = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function validate(opts) {
  const errs = [];
  if (!opts.slug || typeof opts.slug !== 'string') {
    errs.push('内部错误：slug 为空');
  } else if (!SLUG_RE.test(opts.slug.trim())) {
    errs.push(
      `--slug 须匹配 ${SLUG_RE}，仅小写字母、数字、连字符与下划线，且不能以 -/_ 开头或结尾`,
    );
  }
  const desc = opts.description?.trim() ?? '';
  if (!desc) {
    errs.push('内部错误：description 为空');
  } else if (desc.length < DESC_MIN) {
    errs.push(`--description 过短（至少 ${DESC_MIN} 字符）`);
  } else if (desc.length > DESC_MAX) {
    errs.push(`--description 过长（至多 ${DESC_MAX} 字符）`);
  }
  return errs;
}

function fillTemplate(tpl, vars) {
  let s = tpl;
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{{${k}}}`).join(v);
  }
  return s;
}

function main() {
  const opts = parseArgs(process.argv);
  const scriptRel = '.cursor/skills/_shared/create-feature-spec/create-feature-spec.mjs';
  if (opts.help) {
    process.stdout.write(`用法:
  node ${scriptRel} \\
    [--slug <kebab-case-名称>] [--description <需求描述，${DESC_MIN}+ 字符>] \\
    [--title <文档标题>] [--architecture] [--dry-run]

说明:
  --slug          目录名 docs/features/<slug>/，须符合 [a-z0-9_-]；省略时自动生成 feature-<UTC 日期 YYYYMMDD>
  --description   写入 spec.md「需求描述」；长度强校验 ${DESC_MIN}–${DESC_MAX}；省略时使用占位说明
  --title         可选，各 md 一级标题前缀；默认由 slug 生成英文标题
  --architecture  同时创建 architecture.md 骨架（可选超长架构附录）
  --dry-run       只打印将创建的路径与内容预览，不写文件

产出（默认）:
  spec.md（需求）  plan.md（…、技术方案、方案澄清事项、风险、验收标准 AC、开发任务、实现计划）  source/README.md  prd/README.md

模板目录：.cursor/skills/_shared/create-feature-spec/templates/
`);
    process.exit(0);
  }

  const root = repoRoot();
  const slugRaw = opts.slug?.trim() || '';
  const slug = slugRaw || defaultSlug(root);
  const descRaw = opts.description?.trim() || '';
  const description = descRaw || DEFAULT_DESCRIPTION;

  const errs = validate({ slug, description });
  if (errs.length) {
    process.stderr.write(`${errs.join('\n')}\n`);
    process.exit(1);
  }

  if (!slugRaw) {
    process.stdout.write(`未指定 --slug，使用默认目录名: ${slug}\n`);
  }
  if (!descRaw) {
    process.stdout.write('未指定 --description，使用占位需求描述（请后续在 spec 中替换）\n');
  }
  const featureDir = path.join(root, 'docs', 'features', slug);
  const specPath = path.join(featureDir, 'spec.md');
  const planPath = path.join(featureDir, 'plan.md');
  const archPath = path.join(featureDir, 'architecture.md');

  if (!opts.dryRun && fs.existsSync(featureDir)) {
    process.stderr.write(`已存在目录，拒绝覆盖: ${path.relative(root, featureDir)}\n`);
    process.exit(1);
  }

  const title = (opts.title && opts.title.trim()) || titleFromSlug(slug);
  const dateIso = new Date().toISOString().slice(0, 10);
  const vars = {
    FEATURE_SLUG: slug,
    FEATURE_TITLE: title,
    DESCRIPTION: description,
    DATE_ISO: dateIso,
  };

  const tplDir = path.join(__dirname, 'templates');
  const specTpl = fs.readFileSync(path.join(tplDir, 'spec.md.tpl'), 'utf8');
  const specBody = fillTemplate(specTpl, vars);

  const planTpl = fs.readFileSync(path.join(tplDir, 'plan.md.tpl'), 'utf8');
  const planBody = fillTemplate(planTpl, vars);

  let archBody = '';
  if (opts.architecture) {
    const archTpl = fs.readFileSync(path.join(tplDir, 'architecture.md.tpl'), 'utf8');
    archBody = fillTemplate(archTpl, vars);
  }

  const rel = (p) => path.relative(root, p);

  const sourceDir = path.join(featureDir, 'source');
  const sourceReadmePath = path.join(sourceDir, 'README.md');
  const sourceReadmeTpl = path.join(tplDir, 'source', 'README.md');

  const prdDir = path.join(featureDir, 'prd');
  const prdReadmePath = path.join(prdDir, 'README.md');
  const prdReadmeTpl = path.join(tplDir, 'prd', 'README.md');

  if (opts.dryRun) {
    process.stdout.write(`[dry-run] 将创建:\n  ${rel(specPath)}\n`);
    process.stdout.write(`  ${rel(planPath)}\n`);
    process.stdout.write(`  ${rel(sourceReadmePath)}\n`);
    process.stdout.write(`  ${rel(prdReadmePath)}\n`);
    if (opts.architecture) process.stdout.write(`  ${rel(archPath)}\n`);
    process.stdout.write('\n--- spec.md 预览（前 800 字符）---\n');
    process.stdout.write(specBody.slice(0, 800) + (specBody.length > 800 ? '\n...' : '') + '\n');
    process.exit(0);
  }

  fs.mkdirSync(featureDir, { recursive: true });
  fs.writeFileSync(specPath, specBody, 'utf8');
  process.stdout.write(`已写入: ${rel(specPath)}\n`);

  fs.writeFileSync(planPath, planBody, 'utf8');
  process.stdout.write(`已写入: ${rel(planPath)}\n`);

  fs.mkdirSync(sourceDir, { recursive: true });
  let sourceReadmeBody = `# source\n\n（占位）与本 feature 相关的辅助素材目录。\n`;
  if (fs.existsSync(sourceReadmeTpl)) {
    sourceReadmeBody = fs.readFileSync(sourceReadmeTpl, 'utf8');
  }
  fs.writeFileSync(sourceReadmePath, sourceReadmeBody, 'utf8');
  process.stdout.write(`已写入: ${rel(sourceReadmePath)}\n`);

  fs.mkdirSync(prdDir, { recursive: true });
  let prdReadmeBody = `# prd\n\n（占位）留存 PRD / 产品方案等上游文档。\n`;
  if (fs.existsSync(prdReadmeTpl)) {
    prdReadmeBody = fs.readFileSync(prdReadmeTpl, 'utf8');
  }
  fs.writeFileSync(prdReadmePath, prdReadmeBody, 'utf8');
  process.stdout.write(`已写入: ${rel(prdReadmePath)}\n`);

  if (opts.architecture) {
    fs.writeFileSync(archPath, archBody, 'utf8');
    process.stdout.write(`已写入: ${rel(archPath)}\n`);
  }

  process.exit(0);
}

main();
