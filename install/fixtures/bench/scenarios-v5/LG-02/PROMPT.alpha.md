Audit the validators for regex denial-of-service and correctness bugs. Treat user input as attacker-controlled and consider both obvious and subtle catastrophic backtracking cases. Identify the vulnerable expressions, provide a safe replacement, and include at least two concrete malicious or boundary test inputs. Avoid generic advice; tie every finding to this file. Return only JSON matching this schema:
```json
{"vulnerabilities":[{"function":"","regex":"","why_vulnerable":"","safe_pattern":"","test_inputs":[""]}],"overall_risk":"low|medium|high","notes":""}
```