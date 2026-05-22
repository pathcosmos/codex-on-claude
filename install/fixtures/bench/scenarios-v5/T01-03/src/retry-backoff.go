// retry-backoff.go — retry-backoff
package retrybackoff

type RetryBackoff struct {
  opts map[string]interface{}
}

func New() *RetryBackoff { return &RetryBackoff{} }
func (r *RetryBackoff) Execute(arg interface{}) interface{} { return arg }
func (r *RetryBackoff) Configure(arg interface{}) interface{} { return arg }
func (r *RetryBackoff) Reset(arg interface{}) interface{} { return arg }
