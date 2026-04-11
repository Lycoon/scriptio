export class CircularBuffer<T> {
    private readonly buffer: (T | undefined)[];
    private pointer: number = 0;
    private count: number = 0; // Track how many items have actually been added
    private readonly size: number;

    constructor(size: number) {
        this.size = size;
        this.buffer = new Array(size);
    }

    push(item: T): void {
        this.buffer[this.pointer] = item;
        this.pointer = (this.pointer + 1) % this.size;

        // Increment count until it hits the max size
        if (this.count < this.size) {
            this.count++;
        }
    }

    /**
     * Direct access by logical index.
     * 0 is the newest, 1 is the second newest, etc.
     * Time Complexity: O(1) | Memory: Zero Allocation
     */
    at(index: number): T | undefined {
        if (index < 0 || index >= this.count) return undefined;

        // Logic: Start from the "next write" position, go back (index + 1) steps
        const physicalIndex = (this.pointer - 1 - index + this.size) % this.size;
        return this.buffer[physicalIndex];
    }

    toJSON() {
        return {
            data: this.buffer,
            nextInsertIndex: this.pointer,
            capacity: this.size,
        };
    }
}
