// CLI entry point for the Validation Action (.github/workflows/validate-bot.yml).
//
// Reads the submission issue from the environment, parses the form, runs the
// validation pipeline, and on success admits the bot (caches wasm/icon + upserts
// index.json). Writes a Markdown comment to $VALIDATION_COMMENT_FILE and prints
// the outcome to $GITHUB_OUTPUT so the workflow can comment + label + commit.
//
// NOTE: a submission may give either a direct https `.wasm` URL or an OCI
// registry reference — both are pulled by createPuller (see pull-oci.ts). The
// smoke-match fillers are likewise pulled by OCI ref (FILLER_OCI) and/or read
// from local files (FILLER_WASMS). Avatars are fetched + resized by
// createAvatarProcessor (avatar.ts).

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseIssue } from './parse-issue.ts';
import { runValidation, type SubmissionInput, type ValidationDeps } from './checks.ts';
import { admitBot } from './admit.ts';
import { createPuller } from './pull-oci.ts';
import { createAvatarProcessor } from './avatar.ts';
import { loadIndex } from '../store/read.ts';

interface RunEnv {
    issueBody: string;
    issueNumber: number;
    submittedBy: string;
    approvedBy: string;
    storeDir: string;
    fillerWasms: string[];
    fillerOci: string[];
    commentFile: string;
    outputFile: string | null;
}

function readEnv(): RunEnv {
    const env = process.env;
    return {
        issueBody: env.ISSUE_BODY ?? '',
        issueNumber: Number(env.ISSUE_NUMBER ?? '0'),
        submittedBy: env.ISSUE_AUTHOR ?? '',
        approvedBy: env.APPROVER ?? '',
        storeDir: env.STORE_DIR ?? '../gh-pages',
        fillerWasms: (env.FILLER_WASMS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        fillerOci: (env.FILLER_OCI ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        commentFile: env.VALIDATION_COMMENT_FILE ?? 'validation-comment.md',
        outputFile: env.GITHUB_OUTPUT ?? null,
    };
}

async function emit(env: RunEnv, outcome: 'accepted' | 'rejected', comment: string): Promise<void> {
    await writeFile(env.commentFile, comment + '\n');
    if (env.outputFile) await appendFile(env.outputFile, `outcome=${outcome}\n`);
    console.log(`[validate] outcome=${outcome}`);
    console.log(comment);
}

export async function main(): Promise<number> {
    const env = readEnv();
    const { value, errors } = parseIssue(env.issueBody);
    if (errors.length > 0 || !value.oci || !value.author || !value.blurb) {
        await emit(env, 'rejected', `❌ Could not read the submission form:\n\n- ${errors.join('\n- ')}`);
        return 1;
    }

    const input: SubmissionInput = {
        oci: value.oci,
        author: value.author,
        blurb: value.blurb,
        submittedBy: env.submittedBy,
        approvedBy: env.approvedBy,
        issue: env.issueNumber,
    };

    const fillerSamples = [];
    for (const p of env.fillerWasms) {
        fillerSamples.push({ id: p, bytes: new Uint8Array(await readFile(p)) });
    }
    const puller = createPuller();
    for (const ref of env.fillerOci) {
        const art = await puller(ref);
        fillerSamples.push({ id: ref, bytes: art.bytes });
    }

    const deps: ValidationDeps = {
        pullOci: puller,
        processAvatar: createAvatarProcessor(),
        fillerSamples,
    };

    const index = await loadIndex(env.storeDir);
    const result = await runValidation(input, index, deps);

    if (!result.ok) {
        await emit(env, 'rejected', `❌ Validation failed:\n\n${result.reason}`);
        return 1;
    }

    const record = await admitBot(env.storeDir, result.admit);
    await emit(
        env,
        'accepted',
        `✅ Admitted as \`${record.id}\` (${record.glyph} ${record.name} v${record.version}).\n\n` +
        `Cached \`${record.wasm}\`${record.icon ? ` and \`${record.icon}\`` : ''}.`,
    );
    return 0;
}

// CLI entry point.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().then((code) => process.exit(code)).catch((e) => {
        console.error(e);
        process.exit(2);
    });
}
