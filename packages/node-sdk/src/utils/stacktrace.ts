import { StackFrame } from '../types';

export function parseStackTrace(error: Error): StackFrame[] {
    if (!error.stack) {
        return [];
    }

    const lines = error.stack.split('\n');
    const frames: StackFrame[] = [];

    // Skip the first line which is typically "ErrorName: Error message"
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('at ')) {
            continue;
        }

        const frame = parseStackLine(line);
        if (frame) {
            frames.push(frame);
        }
    }

    return frames;
}

function parseStackLine(line: string): StackFrame | null {
    // Typical formats:
    // at functionName (filePath:lineNumber:columnNumber)
    // at filePath:lineNumber:columnNumber
    // at async functionName (filePath:lineNumber:columnNumber)
    
    // Remove the 'at ' prefix
    let cleanLine = line.substring(3).trim();
    
    let functionName = '<anonymous>';
    let fileLocation = '';

    // If it has parentheses, it usually has a function name
    const parenIndex = cleanLine.lastIndexOf('(');
    if (parenIndex !== -1 && cleanLine.endsWith(')')) {
        functionName = cleanLine.substring(0, parenIndex).trim();
        fileLocation = cleanLine.substring(parenIndex + 1, cleanLine.length - 1);
    } else {
        // No parentheses, probably just the file location
        fileLocation = cleanLine;
    }

    // Split file location: /path/to/file.js:10:20
    const parts = fileLocation.split(':');
    if (parts.length < 3) {
        // Might be native code like "(native)"
        return {
            filename: fileLocation,
            function: functionName,
            line: 0,
            column: 0
        };
    }

    const column = parseInt(parts.pop() || '0', 10);
    const lineNum = parseInt(parts.pop() || '0', 10);
    const filename = parts.join(':'); // In case path has colons (like C:\ on Windows)

    return {
        filename,
        function: functionName,
        line: isNaN(lineNum) ? 0 : lineNum,
        column: isNaN(column) ? 0 : column,
    };
}
