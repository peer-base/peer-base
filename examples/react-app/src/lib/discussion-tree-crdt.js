import vectorclock from 'vectorclock'

export default (id) => ({
  initial: () => [],
  join (_s1, _s2) {
    let s1 = clone(_s1)
    const s2 = clone(_s2)

    let i1 = 0
    let i2 = 0
    while (i2 < s2.length) {
      const el1 = s1[i1]
      const el2 = s2[i2]

      if (!el1) {
        s1.push(el2)
        i2++
        continue
      }

      if (el1.cid === el2.cid) {
        i1++
        i2++
        continue
      }
      const comparison = vectorclock.compare(el1.clock, el2.clock)
      if (comparison < 0) {
        // el1 < el2
        i1++
      } else {
        // el1 >= el2

        if (comparison === 0) {
          // concurrent or identical
          // sort by creation date
          if (el1.createdAt > el2.createdAt) {
            insertBefore(el2)
            i2++
          } else {
            if (el1.createdAt === el2.createdAt) {
              if (el1.cid > el2.cid) {
                insertBefore(el2)
                i2++
              } else {
                i1++
              }
            } else {
              // el1.createdAt < el2.createdAt
              i1++
            }
          }
        } else {
          // el1 > el2
          insertBefore(el2)
        }
      }
    }

    return s1

    function insertBefore (el) {
      const insertAt = Math.max(i1 - 1, 0)
      s1 = s1.slice(0, insertAt).concat([el]).concat(s1.slice(insertAt))
    }
  },
  value (s) {
    const cidMap = new Map()
    const tree = []
    for (let _el of s) {
      const el = clone(_el)
      if (cidMap.has(s.cid)) {
        continue
      }
      cidMap.set(el.cid, el)
      const parentCid = el.parentCid
      const parent = parentCid && cidMap.get(parentCid)
      if (parent) {
        if (!parent.children) {
          parent.children = []
        }
        parent.children.push(el)
      } else {
        tree.push(el)
      }
    }

    return tree
  },
  mutators: {
    add (s, {cid, parentCid, did, signature}) {
      const latest = s[s.length - 1]
      const latestClock = (latest && latest.clock) || {}
      const clock = vectorclock.increment(clone(latestClock), id)
      const createdAt = Date.now()
      return [{ clock, createdAt, cid, parentCid, did, signature }]
    }
  }
})

function clone (s) {
  if (Array.isArray(s)) {
    return Array.from(s)
  } else {
    return Object.assign({}, s)
  }
}
