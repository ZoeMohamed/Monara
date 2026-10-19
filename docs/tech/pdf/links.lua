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

-- A bold-only paragraph is a lead-in label. Keep it with the content that follows
-- when a table or a page break would otherwise leave it at the foot of a page.
function Para(el)
  if FORMAT == "typst" and #el.content == 1 and el.content[1].t == "Strong" then
    return {
      pandoc.RawBlock("typst", "#block(sticky: true, below: 0.4em)["),
      el,
      pandoc.RawBlock("typst", "]"),
    }
  end
end
