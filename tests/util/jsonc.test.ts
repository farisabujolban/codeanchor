import { describe, it, expect } from 'vitest';
import { stripJsoncComments } from '../../src/util/jsonc.js';

describe('stripJsoncComments', () => {
    it('leaves plain JSON unchanged', () => {
        const json = '{"a": 1, "b": "hello"}';
        expect(JSON.parse(stripJsoncComments(json))).toEqual({ a: 1, b: 'hello' });
    });

    it('strips // line comments', () => {
        const jsonc = '{\n  // this is a comment\n  "a": 1\n}';
        expect(JSON.parse(stripJsoncComments(jsonc))).toEqual({ a: 1 });
    });

    it('strips /* */ block comments', () => {
        const jsonc = '{ /* block */ "a": 1 }';
        expect(JSON.parse(stripJsoncComments(jsonc))).toEqual({ a: 1 });
    });

    it('does not strip // inside strings', () => {
        const jsonc = '{"url": "http://example.com"}';
        expect(JSON.parse(stripJsoncComments(jsonc))).toEqual({ url: 'http://example.com' });
    });

    it('strips trailing commas before }', () => {
        const jsonc = '{"a": 1,}';
        expect(JSON.parse(stripJsoncComments(jsonc))).toEqual({ a: 1 });
    });

    it('strips trailing commas before ]', () => {
        const jsonc = '{"arr": [1, 2,]}';
        expect(JSON.parse(stripJsoncComments(jsonc))).toEqual({ arr: [1, 2] });
    });

    it('handles nested objects with trailing commas', () => {
        const jsonc = '{"rules": {"CA-CI001": false,}}';
        expect(JSON.parse(stripJsoncComments(jsonc))).toEqual({ rules: { 'CA-CI001': false } });
    });
});
