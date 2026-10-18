-- Turns links to a section that lives in another submission PDF into plain text with a pointer.
local names = {
  technical = "Technical Documentation",
  security = "Security Self-Assessment",
  evidence = "Execution Evidence",
}

function Link(el)
  local key = el.target:match("^xdoc:(%a+)$")
  if not key then return nil end
  local out = pandoc.Inlines(el.content)
  out:insert(pandoc.Space())
  out:insert(pandoc.Str("(see the " .. names[key] .. " PDF)"))
  return out
end
