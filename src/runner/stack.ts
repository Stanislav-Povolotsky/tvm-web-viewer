import { Cell, OutAction, loadOutList, OutActionReserve } from '@ton/core';
import { StackElement } from './types';

function parseStackElement(word: string): StackElement {
    // Parsing every type of stack element:
    //
    // Integer - signed 257-bit integers
    // Tuple - ordered collection of up to 255 elements having arbitrary value types, possibly distinct.
    // Null
    // And four distinct flavours of cells:
    // Cell - basic (possibly nested) opaque structure used by TON Blockchain for storing all data
    // Slice - a special object which allows you to read from a cell
    // Builder - a special object which allows you to create new cells
    // Continuation - a special object which allows you to use a cell as source of TVM instructions
    //
    // See https://docs.ton.org/learn/tvm-instructions/tvm-overview#tvm-is-a-stack-machine
    if (word == '()') {
        // just null
        return null;
    } else if (word.startsWith('(') && word.endsWith(')')) {
        // tuple of 1 element
        return [parseStackElement(word.slice(1, -1))];
    } else if (word.startsWith('C{')) {
        // cell - push Cell type
        try {
            let cell = Cell.fromBoc(Buffer.from(word.slice(2, -1), 'hex'))[0];
            return cell;
        } catch (e) {
            console.error('Error parsing cell:', e);
            return word;
        }
    } else if (word.startsWith('Cont{')) {
        // continuation - Cell type
        try {
            let cell = Cell.fromBoc(Buffer.from(word.slice(5, -1), 'hex'))[0];
            return cell;
        } catch (e) {
            console.error('Error parsing continuation:', e);
            return word;
        }
    } else if (word.startsWith('CS{')) {
        // slice - Slice or Address type
        try {
            let cell = Cell.fromBoc(Buffer.from(word.slice(3, -1), 'hex'))[0];
            let slice = cell.asSlice();
            if (slice.remainingBits == 267 && slice.remainingRefs == 0) {
                return slice.loadAddress();
            }
            return slice;
        } catch (e) {
            console.error(`Error parsing slice ${word}: ${e}`);
            return word;
        }
    } else if (word.startsWith('BC{')) {
        // builder - Builder type
        try {
            let cell = Cell.fromBoc(Buffer.from(word.slice(3, -1), 'hex'))[0];
            let builder = cell.asBuilder();
            return builder;
        } catch (e) {
            console.error('Error parsing builder:', e);
            return word;
        }
    } else {
        try {
            // try parsing Integer
            return BigInt(word);
        } catch {
            // some unknown type
            // bad behavior
            console.warn('Unknown stack element:', word);
            return word;
        }
    }
}

export function parseStack(line: string): any[] {
    // put spaces before and after every '[' and ']'
    line = line.replace(/\[/g, ' [ ');
    line = line.replace(/\]/g, ' ] ');

    // split by spaces
    const words = line.split(/\s+/);
    const stackStack: any[][] = []; // Stack of stacks

    for (let i = 0; i < words.length; i++) {
        let word = words[i].trim();

        // skip some basic info
        if (['stack:', ''].indexOf(word) !== -1) continue;

        if (word == '[') {
            // tuple start
            const newStack: any[] = [];
            stackStack.push(newStack);
            continue;
        }
        if (word == ']') {
            // tuple end
            const tuple = stackStack.pop();
            if (tuple == undefined) {
                throw new Error(
                    'Something unexpected. Tuple ended without start.'
                );
            }
            if (stackStack.length > 0) {
                // end some nested tuple
                stackStack[stackStack.length - 1].push(tuple);
                continue;
            } else {
                // end of the whole stack - return result
                return tuple;
            }
        }

        let stackElement = parseStackElement(word);
        if (stackElement !== undefined) {
            stackStack[stackStack.length - 1].push(stackElement);
        }
    }
    // should not go there, but just in case
    return stackStack[0];
}

export function parseC5(line: string): (OutAction | OutActionReserve)[] {
    // example:
    // final c5: C{B5EE9C7...8877FA}
    const cellBoc = Buffer.from(line.slice(12, -1), 'hex');
    const c5 = Cell.fromBoc(cellBoc)[0];
    const c5Slice = c5.beginParse();
    return loadOutList(c5Slice);
}
