// feature-flag.ts
export class FeatureFlag {
  constructor(public opts: any = {}) {}
  isEnabled(arg: any): any { return arg; }
  override(arg: any): any { return arg; }
  snapshot(arg: any): any { return arg; }
}
