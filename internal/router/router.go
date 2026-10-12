package router

import (
	pathpkg "path"
	"strings"
	"sync"
)

type Params map[string]string

type Router struct {
	mu   sync.RWMutex
	root *node
}

type node struct {
	static    map[string]*node
	param     *node
	paramKey  string
	upstreams map[string]string
}

type match struct {
	upstream string
	params   Params
	depth    int
	static   int
	found    bool
}

func New() *Router {
	return &Router{root: &node{static: make(map[string]*node)}}
}

func (router *Router) Insert(method, routePath, upstream string) {
	segments := splitPath(routePath)
	method = strings.ToUpper(method)

	router.mu.Lock()
	defer router.mu.Unlock()

	if router.root == nil {
		router.root = &node{static: make(map[string]*node)}
	}

	current := router.root
	for _, segment := range segments {
		if strings.HasPrefix(segment, ":") && len(segment) > 1 {
			if current.param == nil {
				current.param = &node{static: make(map[string]*node), paramKey: segment[1:]}
			}
			current = current.param
			continue
		}

		if current.static == nil {
			current.static = make(map[string]*node)
		}
		if current.static[segment] == nil {
			current.static[segment] = &node{static: make(map[string]*node)}
		}
		current = current.static[segment]
	}

	if current.upstreams == nil {
		current.upstreams = make(map[string]string)
	}
	current.upstreams[method] = upstream
}

func (router *Router) Lookup(method, requestPath string) (string, Params, bool) {
	segments := splitPath(requestPath)
	method = strings.ToUpper(method)

	router.mu.RLock()
	defer router.mu.RUnlock()

	if router.root == nil {
		return "", nil, false
	}

	best := match{}
	lookup(router.root, method, segments, 0, 0, nil, &best)
	if !best.found {
		return "", nil, false
	}
	return best.upstream, best.params, true
}

func lookup(current *node, method string, segments []string, index, staticCount int, params Params, best *match) {
	if upstream, found := current.upstreams[method]; found {
		candidate := match{
			upstream: upstream,
			params:   cloneParams(params),
			depth:    index,
			static:   staticCount,
			found:    true,
		}
		if !best.found || candidate.depth > best.depth || (candidate.depth == best.depth && candidate.static > best.static) {
			*best = candidate
		}
	}

	if index == len(segments) {
		return
	}

	if staticChild := current.static[segments[index]]; staticChild != nil {
		lookup(staticChild, method, segments, index+1, staticCount+1, params, best)
	}

	if current.param != nil {
		if params == nil {
			params = make(Params)
		} else {
			params = cloneParams(params)
		}
		params[current.param.paramKey] = segments[index]
		lookup(current.param, method, segments, index+1, staticCount, params, best)
	}
}

func splitPath(routePath string) []string {
	cleaned := pathpkg.Clean("/" + strings.TrimSpace(routePath))
	if cleaned == "/" {
		return nil
	}
	return strings.Split(strings.TrimPrefix(cleaned, "/"), "/")
}

func cloneParams(params Params) Params {
	if len(params) == 0 {
		return nil
	}
	clone := make(Params, len(params))
	for key, value := range params {
		clone[key] = value
	}
	return clone
}
