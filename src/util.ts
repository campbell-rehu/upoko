type Func =
  | ((...args: any[]) => any)
  | ((...args: any[]) => Promise<any>)
  | ((...args: any[]) => void)
  | ((...args: any[]) => Promise<void>);

export function run(dryRunMode: boolean, f: Func, ...args: any[]): any {
  if (dryRunMode) {
    const functionName = f.name || "Anonymous function";
    console.log(`\nDRY RUN MODE: Function "${functionName}" not executed.`);
    return;
  }
  return f(...args);
}
export function convertUint8ArraysToBuffers(obj: any) {
  // Check if the argument is an object and not null
  if (typeof obj === "object" && obj !== null) {
    // Iterate through each key in the object
    Object.keys(obj).forEach((key: string) => {
      const value = obj[key];
      // If the value is an Uint8Array, convert it to a Buffer
      if (value instanceof Uint8Array) {
        obj[key] = Buffer.from(value);
      }
      // If the value is an object, apply the function recursively
      else if (typeof value === "object") {
        convertUint8ArraysToBuffers(value);
      }
    });
  }
}
export function mapAndJoinOnField(field: string = "name") {
  return (arr: any[]) => {
    if (!Array.isArray(arr)) {
      return "";
    }
    return arr.map((item) => item[field]).join(", ");
  };
}
