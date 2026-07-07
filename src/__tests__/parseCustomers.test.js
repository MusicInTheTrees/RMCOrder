import { describe, test, expect } from 'vitest';
import { parseCustomers } from '../utils/parseCustomers';

describe('parseCustomers', () => {
  test('parses "Name, email"', () => {
    const { rows } = parseCustomers('Jordan, jordan@x.com');
    expect(rows).toEqual([{ name: 'Jordan', email: 'jordan@x.com' }]);
  });
  test('parses "Name <email>"', () => {
    const { rows } = parseCustomers('Sam Lee <sam@x.com>');
    expect(rows).toEqual([{ name: 'Sam Lee', email: 'sam@x.com' }]);
  });
  test('parses bare email with blank name', () => {
    const { rows } = parseCustomers('solo@x.com');
    expect(rows).toEqual([{ name: '', email: 'solo@x.com' }]);
  });
  test('handles multiple lines and trims', () => {
    const { rows } = parseCustomers('  Jordan , jordan@x.com \nsolo@x.com');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: 'Jordan', email: 'jordan@x.com' });
  });
  test('reports lines with no valid email as skipped with a reason', () => {
    const { rows, skipped } = parseCustomers('not an email\nJordan, jordan@x.com');
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual([{ line: 'not an email', reason: 'no email address found' }]);
  });
  test('ignores empty lines', () => {
    const { rows } = parseCustomers('\n\njordan@x.com\n');
    expect(rows).toHaveLength(1);
  });
});
