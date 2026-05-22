interface Container<T> {
  value: T;
  map<U>(fn: (t: T) => U): Container<U>;
}

interface Validator<T> {
  validate(input: unknown): input is T;
}

function chainValidators<A, B, C>(
  v1: Validator<A>,
  v2: (a: A) => Validator<B>,
  v3: (b: B) => Validator<C>
): Validator<C> {
  return {
    validate(input: unknown): input is C {
      if (!v1.validate(input)) return false;
      const v2Instance = v2(input);  // Type error: input is A, v2 returns Validator<B>
      if (!v2Instance.validate(input)) return false;  // Wrong type passed to v2Instance
      const v3Instance = v3(input);  // Should use result of v2 validation
      return v3Instance.validate(input);  // Wrong type for v3Instance
    }
  };
}