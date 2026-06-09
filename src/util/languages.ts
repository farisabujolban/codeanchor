import { cstyleDriver } from './lang-cstyle.js';
import { pythonDriver } from './lang-python.js';
export type { LanguageDriver } from './language-driver.js';
import type { LanguageDriver } from './language-driver.js';

const drivers: LanguageDriver[] = [cstyleDriver, pythonDriver];

export function getDriver(filePath: string): LanguageDriver | null {
    const idx = filePath.lastIndexOf('.');
    const ext = idx === -1 ? '' : filePath.slice(idx);
    return drivers.find((d) => d.extensions.includes(ext)) ?? null;
}
