import { createHash } from 'node:crypto';
export function sha256(input) {
    return createHash('sha256').update(input, 'utf-8').digest('hex');
}
