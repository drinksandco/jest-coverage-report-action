import { join } from 'path';

import { exec } from '@actions/exec';
import { readFile, rmdir } from 'fs-extra';

import { REPORT_PATH } from '../constants/REPORT_PATH';
import { PackageManagerType, SkipStepType } from '../typings/Options';
import { FailReason } from '../typings/Report';

const joinPaths = (...segments: Array<string | undefined>) =>
    join(...(segments as string[]).filter((segment) => segment !== undefined));

const getPackageManagerInstallCommand = (
    packageManager: PackageManagerType
): string => `${packageManager} install --legacy-peer-deps`;

const shouldInstallDeps = (skipStep: SkipStepType): Boolean =>
    !['all', 'install'].includes(skipStep);

const shouldRunTestScript = (skipStep: SkipStepType): Boolean =>
    !['all'].includes(skipStep);

export const getRawCoverage = async (
    testCommand: string,
    packageManager: PackageManagerType,
    skipStep: SkipStepType,
    branch?: string,
    workingDirectory?: string
): Promise<
    | string
    | { success: false; failReason: FailReason.TESTS_FAILED; error?: Error }
> => {
    if (branch) {
        // NOTE: It is possible that the 'git fetch -all' command will fail due to different file permissions, so allow that to fail gracefully
        try {
            await exec(`git fetch --all --depth=1`);
        } catch (err) {
            console.warn('Error fetching git repository', err);
        }
        await exec(`git checkout -f ${branch}`);
    }

    // NOTE: The `npm ci` command is not used. Because if your version of npm is old, the generated `package-lock.json` will also be old, and the latest version of `npm ci` will fail.
    await rmdir(joinPaths(workingDirectory, 'node_modules'), {
        recursive: true,
    });

    if (shouldInstallDeps(skipStep)) {
        await exec(getPackageManagerInstallCommand(packageManager), undefined, {
            cwd: workingDirectory,
        });
    }

    let executionError: Error | undefined = undefined;

    if (shouldRunTestScript(skipStep)) {
        try {
            await exec(testCommand, [], {
                cwd: workingDirectory,
            });
        } catch (error) {
            console.error('Test execution failed with error:', error);
            executionError = error instanceof Error ? error : undefined;
        }
    }

    try {
        const outBuff = await readFile(
            joinPaths(workingDirectory, REPORT_PATH)
        );
        return outBuff.toString();
    } catch (error) {
        console.error(
            'Could not read report file located at',
            joinPaths(workingDirectory, REPORT_PATH),
            error
        );

        return {
            success: false,
            failReason: FailReason.TESTS_FAILED,
            error: executionError,
        };
    }
};
