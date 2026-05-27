import { cstyleDriver } from './lang-cstyle.js';
import { pythonDriver } from './lang-python.js';
const drivers = [cstyleDriver, pythonDriver];
export function getDriver(filePath) {
    const idx = filePath.lastIndexOf('.');
    const ext = idx === -1 ? '' : filePath.slice(idx);
    return drivers.find(d => d.extensions.includes(ext)) ?? null;
}
