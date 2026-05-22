// request-router.go — request-router
package requestrouter

type RequestRouter struct {
  opts map[string]interface{}
}

func New() *RequestRouter { return &RequestRouter{} }
func (r *RequestRouter) Route(arg interface{}) interface{} { return arg }
func (r *RequestRouter) AddHandler(arg interface{}) interface{} { return arg }
func (r *RequestRouter) Match(arg interface{}) interface{} { return arg }
