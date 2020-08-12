import { join } from "path";

const projectRoot = join(__dirname, "..");
const distRoot = join(projectRoot, "./dist");

/**
 * @internal
 */
export const lambdaAssetsDir = (name: string): string => join(distRoot, name);
