const colors = [
  "#1f78b4",
  "#33a02c",
  "#e31a1c",
  "#ff7f00",
  "#6a3d9a",
  "#b15928",
  "#a6cee3",
  "#b2df8a",
  "#fb9a99",
  "#fdbf6f",
  "#cab2d6",
  "#999955"
]

let colorIndex = 0
const colorMap = {}
function getColor(id) {
  if (!colorMap[id]) {
    const color = colors[colorIndex]
    colorIndex = (colorIndex + 1) % colors.length
    colorMap[id] = color
  }
  return colorMap[id]
}

module.exports = {
  colors,
  getColor
}