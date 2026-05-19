/**
 * 微信小程序二维码生成库
 * 纯 Canvas 实现，零依赖，兼容微信小程序基础库 2.2.3+
 *
 * 用法:
 *   const QRCode = require('./weapp-qrcode.js')
 *   const qr = new QRCode('canvas-id', {
 *     text: '要编码的内容',
 *     width: 200,
 *     height: 200,
 *     colorDark: '#000000',
 *     colorLight: '#ffffff',
 *     correctLevel: QRCode.CorrectLevel.H
 *   })
 */

// ====== QR 码常数 ======
const QRMode = {
  MODE_NUMBER: 1 << 0,
  MODE_ALPHA_NUM: 1 << 1,
  MODE_8BIT_BYTE: 1 << 2,
  MODE_KANJI: 1 << 3
}

const QRErrorCorrectLevel = { L: 1, M: 0, Q: 3, H: 2 }

const QRMaskPattern = {
  PATTERN000: 0, PATTERN001: 1, PATTERN010: 2, PATTERN011: 3,
  PATTERN100: 4, PATTERN101: 5, PATTERN110: 6, PATTERN111: 7
}

// ====== GF(256) 运算 ======
const QRMath = (function () {
  const EXP_TABLE = new Array(256)
  const LOG_TABLE = new Array(256)
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i
  for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8]
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i
  return {
    glog: function (n) { if (n < 1) throw new Error('glog(' + n + ')'); return LOG_TABLE[n] },
    gexp: function (n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP_TABLE[n] }
  }
})()

// ====== 多项式 ======
function QRPolynomial(num, shift) {
  if (!num.length) throw new Error(num.length + '/' + shift)
  let offset = 0
  while (offset < num.length && num[offset] === 0) offset++
  this.num = new Array(num.length - offset + shift)
  for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset]
}

QRPolynomial.prototype = {
  get: function (index) { return this.num[index] },
  getLength: function () { return this.num.length },
  multiply: function (e) {
    const num = new Array(this.getLength() + e.getLength() - 1)
    for (let i = 0; i < this.getLength(); i++)
      for (let j = 0; j < e.getLength(); j++)
        num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)))
    return new QRPolynomial(num, 0)
  },
  mod: function (e) {
    if (this.getLength() - e.getLength() < 0) return this
    const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0))
    const num = new Array(this.getLength())
    for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i)
    for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio)
    return new QRPolynomial(num, 0).mod(e)
  }
}

// ====== BCH 编码 ======
const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0)
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0)
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1)

function getBCHDigit(data) { let d = 0; while (data !== 0) { d++; data >>>= 1 } return d }
function getBCHTypeInfo(data) { let d = data << 10; while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15))); return ((data << 10) | d) ^ G15_MASK }
function getBCHTypeNumber(data) { let d = data << 12; while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18))); return (data << 12) | d }

// ====== 对齐模式位置 ======
const alignmentPatternPositions = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170]
]

// ====== RS 纠错块表：tables[errorCorrectLevel][version-1] = [块数, 数据码字数, 纠错码字数, ...] ======
function getRSBlocks(typeNumber, errorCorrectLevel) {
  // 每个版本在不同纠错等级下的 RS 块配置
  // 格式: [块数, 数据码字数, 纠错码字数, (块数2, 数据2, 纠错2)]
  const table = [
    // L(1)
    [
      [1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],
      [1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],
      [1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],
      [4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],
      [2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],
      [3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],
      [4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],
      [1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],
      [6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],
      [8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],
      [4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],
      [5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],
      [7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],
      [10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],
      [9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],
      [3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],
      [3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],
      [17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],
      [7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],
      [11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],
      [11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],
      [7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],
      [28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],
      [8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],
      [4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],
      [1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],
      [15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],
      [42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],
      [10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],
      [29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],
      [44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],
      [39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],
      [46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],
      [49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],
      [48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],
      [43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],
      [34,54,24,34,55,25],[20,45,15,61,46,16]
    ],
    // M(0)
    [
      [1,26,16],[1,26,13],[1,26,9],[1,26,7],[1,44,28],[1,44,22],[1,44,16],[1,44,10],
      [1,70,44],[1,70,34],[2,35,13],[2,35,11],[1,100,64],[2,50,28],[2,50,20],[4,25,8],
      [1,134,86],[2,67,39],[2,33,14,2,34,15],[2,33,10,2,34,11],[2,86,56],[4,43,23],
      [4,43,15],[4,43,11],[2,98,62],[4,49,27],[2,32,12,4,33,13],[4,39,11,1,40,12],
      [2,121,78],[2,60,32,2,61,33],[4,40,14,2,41,15],[4,40,10,2,41,11],[2,146,86],
      [3,58,30,2,59,31],[4,36,12,4,37,13],[4,36,8,4,37,9],[2,86,54,2,87,55],
      [4,69,37,1,70,38],[6,43,15,2,44,16],[6,43,11,2,44,12],[4,101,69],
      [1,80,42,4,81,43],[4,50,18,4,51,19],[3,36,10,8,37,11],[2,116,70,2,117,71],
      [6,58,30,2,59,31],[4,46,14,6,47,15],[7,42,10,4,43,11],[4,133,87],
      [8,59,31,1,60,32],[8,44,14,4,45,15],[12,33,9,4,34,10],[3,145,97,1,146,98],
      [4,64,31,5,65,32],[11,36,12,5,37,13],[11,36,8,5,37,9],[5,109,67,1,110,68],
      [5,65,33,5,66,34],[5,54,18,7,55,19],[11,36,10],[5,122,78,1,123,79],
      [7,73,37,3,74,38],[15,43,15,2,44,16],[3,45,11,13,46,12],[1,135,85,5,136,86],
      [10,74,38,1,75,39],[1,50,16,15,51,17],[2,42,12,17,43,13],[5,150,96,1,151,97],
      [9,69,35,4,70,36],[17,50,14,1,51,15],[2,42,10,19,43,11],[3,141,93,4,142,94],
      [3,70,37,11,71,38],[17,47,17,4,48,18],[9,39,11,16,40,12],[3,135,89,5,136,90],
      [3,67,33,13,68,34],[15,54,20,5,55,21],[15,43,11,10,44,12],[4,144,93,4,145,94],
      [17,68,34],[17,50,18,6,51,19],[19,46,12,6,47,13],[2,139,89,7,140,90],[17,74,38],
      [7,54,20,16,55,21],[34,37,9],[4,151,96,5,152,97],[4,75,37,14,76,38],
      [11,54,20,14,55,21],[16,45,11,14,46,12],[6,147,93,4,148,94],[6,73,37,14,74,38],
      [11,54,20,16,55,21],[30,46,12,2,47,13],[8,132,86,4,133,87],[8,75,37,13,76,38],
      [7,54,18,22,55,19],[22,45,11,13,46,12],[10,142,92,2,143,93],[19,74,38,4,75,39],
      [28,50,18,6,51,19],[33,46,14,4,47,15],[8,152,100,4,153,101],[22,73,37,3,74,38],
      [8,53,21,26,54,22],[12,45,13,28,46,14],[3,147,97,10,148,98],[3,73,37,23,74,38],
      [4,54,22,31,55,23],[11,45,13,31,46,14],[7,146,96,7,147,97],[21,73,37,7,74,38],
      [1,53,21,37,54,22],[19,45,13,26,46,14],[5,145,95,10,146,96],[19,75,37,10,76,38],
      [15,54,22,25,55,23],[23,45,13,25,46,14],[13,145,93,3,146,94],[2,74,38,29,75,39],
      [42,54,22,1,55,23],[23,45,13,28,46,14],[17,145,94],[10,74,38,23,75,39],
      [10,54,22,35,55,23],[19,45,13,35,46,14],[17,145,93,1,146,94],[14,74,38,21,75,39],
      [29,54,20,19,55,21],[11,45,13,46,46,14],[13,145,96,6,146,97],[14,74,38,23,75,39],
      [44,54,18,7,55,19],[59,46,12,1,47,13],[12,151,100,7,152,101],[12,75,37,26,76,38],
      [39,54,20,14,55,21],[22,45,13,41,46,14],[6,151,100,14,152,101],[6,75,37,34,76,38],
      [46,54,20,10,55,21],[2,45,13,64,46,14],[17,152,100,4,153,101],[29,74,38,14,75,39],
      [49,54,20,10,55,21],[24,45,13,46,46,14],[4,152,100,18,153,101],[13,74,38,32,75,39],
      [48,54,20,14,55,21],[42,45,13,32,46,14],[20,147,96,4,148,97],[40,75,37,7,76,38],
      [43,54,20,22,55,21],[10,45,13,67,46,14],[19,148,96,6,149,97],[18,75,37,31,76,38],
      [34,54,20,34,55,21],[20,45,13,61,46,14]
    ],
    // Q(3)
    [
      [1,26,13],[1,26,9],[1,26,7],[1,26,5],[1,44,22],[1,44,16],[1,44,12],[1,44,8],
      [1,70,34],[1,70,26],[2,35,11],[2,35,7],[1,100,48],[2,50,22],[2,50,14],[4,25,6],
      [1,134,62],[2,67,31],[2,33,12,2,34,13],[2,33,8,2,34,9],[2,86,44],[4,43,17],
      [4,43,13],[4,43,9],[2,98,46],[4,49,21],[2,32,10,4,33,11],[4,39,9,1,40,10],
      [2,121,58],[2,60,26,2,61,27],[4,40,10,2,41,11],[4,40,8,2,41,9],[2,146,66],
      [3,58,24,2,59,25],[4,36,10,4,37,11],[4,36,6,4,37,7],[2,86,42,2,87,43],
      [4,69,29,1,70,30],[6,43,13,2,44,14],[6,43,9,2,44,10],[4,101,55],
      [1,80,34,4,81,35],[4,50,14,4,51,15],[3,36,8,8,37,9],[2,116,52,2,117,53],
      [6,58,24,2,59,25],[4,46,12,6,47,13],[7,42,8,4,43,9],[4,133,69],
      [8,59,25,1,60,26],[8,44,12,4,45,13],[12,33,7,4,34,8],[3,145,77,1,146,78],
      [4,64,25,5,65,26],[11,36,10,5,37,11],[11,36,6,5,37,7],[5,109,53,1,110,54],
      [5,65,27,5,66,28],[5,54,14,7,55,15],[11,36,8],[5,122,62,1,123,63],
      [7,73,31,3,74,32],[15,43,13,2,44,14],[3,45,9,13,46,10],[1,135,69,5,136,70],
      [10,74,30,1,75,31],[1,50,14,15,51,15],[2,42,10,17,43,11],[5,150,76,1,151,77],
      [9,69,29,4,70,30],[17,50,12,1,51,13],[2,42,8,19,43,9],[3,141,75,4,142,76],
      [3,70,31,11,71,32],[17,47,15,4,48,16],[9,39,9,16,40,10],[3,135,71,5,136,72],
      [3,67,27,13,68,28],[15,54,16,5,55,17],[15,43,9,10,44,10],[4,144,75,4,145,76],
      [17,68,26],[17,50,14,6,51,15],[19,46,10,6,47,11],[2,139,71,7,140,72],[17,74,30],
      [7,54,16,16,55,17],[34,37,7],[4,151,74,5,152,75],[4,75,29,14,76,30],
      [11,54,16,14,55,17],[16,45,9,14,46,10],[6,147,73,4,148,74],[6,73,29,14,74,30],
      [11,54,16,16,55,17],[30,46,10,2,47,11],[8,132,72,4,133,73],[8,75,29,13,76,30],
      [7,54,14,22,55,15],[22,45,9,13,46,10],[10,142,74,2,143,75],[19,74,30,4,75,31],
      [28,50,14,6,51,15],[33,46,12,4,47,13],[8,152,82,4,153,83],[22,73,29,3,74,30],
      [8,53,17,26,54,18],[12,45,11,28,46,12],[3,147,79,10,148,80],[3,73,31,23,74,32],
      [4,54,18,31,55,19],[11,45,11,31,46,12],[7,146,78,7,147,79],[21,73,29,7,74,30],
      [1,53,17,37,54,18],[19,45,11,26,46,12],[5,145,77,10,146,78],[19,75,29,10,76,30],
      [15,54,18,25,55,19],[23,45,11,25,46,12],[13,145,73,3,146,74],[2,74,30,29,75,31],
      [42,54,18,1,55,19],[23,45,11,28,46,12],[17,145,74],[10,74,30,23,75,31],
      [10,54,18,35,55,19],[19,45,11,35,46,12],[17,145,73,1,146,74],[14,74,30,21,75,31],
      [29,54,16,19,55,17],[11,45,11,46,46,12],[13,145,76,6,146,77],[14,74,30,23,75,31],
      [44,54,14,7,55,15],[59,46,10,1,47,11],[12,151,82,7,152,83],[12,75,29,26,76,30],
      [39,54,16,14,55,17],[22,45,11,41,46,12],[6,151,82,14,152,83],[6,75,29,34,76,30],
      [46,54,16,10,55,17],[2,45,11,64,46,12],[17,152,82,4,153,83],[29,74,30,14,75,31],
      [49,54,16,10,55,17],[24,45,11,46,46,12],[4,152,82,18,153,83],[13,74,30,32,75,31],
      [48,54,16,14,55,17],[42,45,11,32,46,12],[20,147,78,4,148,79],[40,75,29,7,76,30],
      [43,54,16,22,55,17],[10,45,11,67,46,12],[19,148,78,6,149,79],[18,75,29,31,76,30],
      [34,54,16,34,55,17],[20,45,11,61,46,12]
    ],
    // H(2)
    [
      [1,26,9],[1,26,7],[1,26,5],[1,26,4],[1,44,16],[1,44,12],[1,44,8],[1,44,6],
      [1,70,26],[1,70,18],[2,35,7],[2,35,5],[1,100,36],[2,50,16],[2,50,10],[4,25,4],
      [1,134,46],[2,67,25],[2,33,8,2,34,9],[2,33,6,2,34,7],[2,86,34],[4,43,13],
      [4,43,9],[4,43,7],[2,98,34],[4,49,15],[2,32,8,4,33,9],[4,39,7,1,40,8],
      [2,121,44],[2,60,22,2,61,23],[4,40,8,2,41,9],[4,40,6,2,41,7],[2,146,50],
      [3,58,20,2,59,21],[4,36,8,4,37,9],[4,36,4,4,37,5],[2,86,32,2,87,33],
      [4,69,23,1,70,24],[6,43,11,2,44,12],[6,43,7,2,44,8],[4,101,45],
      [1,80,28,4,81,29],[4,50,12,4,51,13],[3,36,6,8,37,7],[2,116,38,2,117,39],
      [6,58,20,2,59,21],[4,46,10,6,47,11],[7,42,6,4,43,7],[4,133,57],
      [8,59,21,1,60,22],[8,44,10,4,45,11],[12,33,5,4,34,6],[3,145,61,1,146,62],
      [4,64,21,5,65,22],[11,36,8,5,37,9],[11,36,4,5,37,5],[5,109,41,1,110,42],
      [5,65,23,5,66,24],[5,54,10,7,55,11],[11,36,6],[5,122,48,1,123,49],
      [7,73,25,3,74,26],[15,43,11,2,44,12],[3,45,7,13,46,8],[1,135,55,5,136,56],
      [10,74,24,1,75,25],[1,50,12,15,51,13],[2,42,8,17,43,9],[5,150,60,1,151,61],
      [9,69,25,4,70,26],[17,50,10,1,51,11],[2,42,6,19,43,7],[3,141,61,4,142,62],
      [3,70,27,11,71,28],[17,47,13,4,48,14],[9,39,7,16,40,8],[3,135,57,5,136,58],
      [3,67,23,13,68,24],[15,54,12,5,55,13],[15,43,7,10,44,8],[4,144,61,4,145,62],
      [17,68,18],[17,50,10,6,51,11],[19,46,8,6,47,9],[2,139,57,7,140,58],[17,74,24],
      [7,54,12,16,55,13],[34,37,5],[4,151,58,5,152,59],[4,75,23,14,76,24],
      [11,54,12,14,55,13],[16,45,7,14,46,8],[6,147,57,4,148,58],[6,73,23,14,74,24],
      [11,54,12,16,55,13],[30,46,8,2,47,9],[8,132,60,4,133,61],[8,75,23,13,76,24],
      [7,54,10,22,55,11],[22,45,7,13,46,8],[10,142,60,2,143,61],[19,74,24,4,75,25],
      [28,50,10,6,51,11],[33,46,10,4,47,11],[8,152,68,4,153,69],[22,73,23,3,74,24],
      [8,53,15,26,54,16],[12,45,9,28,46,10],[3,147,65,10,148,66],[3,73,25,23,74,26],
      [4,54,14,31,55,15],[11,45,9,31,46,10],[7,146,64,7,147,65],[21,73,21,7,74,22],
      [1,53,13,37,54,14],[19,45,9,26,46,10],[5,145,63,10,146,64],[19,75,23,10,76,24],
      [15,54,14,25,55,15],[23,45,9,25,46,10],[13,145,57,3,146,58],[2,74,24,29,75,25],
      [42,54,14,1,55,15],[23,45,9,28,46,10],[17,145,58],[10,74,24,23,75,25],
      [10,54,14,35,55,15],[19,45,9,35,46,10],[17,145,57,1,146,58],[14,74,24,21,75,25],
      [29,54,12,19,55,13],[11,45,9,46,46,10],[13,145,60,6,146,61],[14,74,24,23,75,25],
      [44,54,10,7,55,11],[59,46,8,1,47,9],[12,151,68,7,152,69],[12,75,23,26,76,24],
      [39,54,12,14,55,13],[22,45,9,41,46,10],[6,151,68,14,152,69],[6,75,23,34,76,24],
      [46,54,12,10,55,13],[2,45,9,64,46,10],[17,152,68,4,153,69],[29,74,24,14,75,25],
      [49,54,12,10,55,13],[24,45,9,46,46,10],[4,152,68,18,153,69],[13,74,24,32,75,25],
      [48,54,12,14,55,13],[42,45,9,32,46,10],[20,147,64,4,148,65],[40,75,23,7,76,24],
      [43,54,12,22,55,13],[10,45,9,67,46,10],[19,148,64,6,149,65],[18,75,23,31,76,24],
      [34,54,12,34,55,13],[20,45,9,61,46,10]
    ]
  ]

  const version = typeNumber - 1
  if (version < 0 || version >= 40) return null
  const entry = table[errorCorrectLevel][version]
  if (!entry) return null

  const blocks = []
  for (let i = 0; i < entry.length; i += 3) {
    const count = entry[i]
    const dataCount = entry[i + 1]
    const ecCount = entry[i + 2]
    for (let j = 0; j < count; j++) {
      blocks.push({ dataCount, ecCount })
    }
  }

  let totalDataCount = 0
  let totalECCount = 0
  for (let i = 0; i < blocks.length; i++) {
    totalDataCount += blocks[i].dataCount
    totalECCount += blocks[i].ecCount
  }

  return { blocks, totalDataCount, totalECCount }
}

// ====== 生成纠错码多项式 ======
function createBytes(buffer, rsBlocks) {
  let offset = 0
  let maxDcCount = 0
  let maxEcCount = 0
  const dcdata = new Array(rsBlocks.blocks.length)
  const ecdata = new Array(rsBlocks.blocks.length)

  for (let r = 0; r < rsBlocks.blocks.length; r++) {
    const dcCount = rsBlocks.blocks[r].dataCount
    const ecCount = rsBlocks.blocks[r].ecCount
    maxDcCount = Math.max(maxDcCount, dcCount)
    maxEcCount = Math.max(maxEcCount, ecCount)
    dcdata[r] = new Array(dcCount)
    for (let i = 0; i < dcdata[r].length; i++) {
      dcdata[r][i] = 0xff & buffer[offset + i]
    }
    offset += dcCount

    const rsPoly = getErrorCorrectPolynomial(ecCount)
    const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1)
    const modPoly = rawPoly.mod(rsPoly)
    ecdata[r] = new Array(rsPoly.getLength() - 1)
    for (let i = 0; i < ecdata[r].length; i++) {
      const modIndex = i + modPoly.getLength() - ecdata[r].length
      ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0
    }
  }

  const totalCodeCount = rsBlocks.totalDataCount + rsBlocks.totalECCount
  const result = new Array(totalCodeCount)
  let i = 0
  for (let j = 0; j < maxDcCount; j++) {
    for (let r = 0; r < rsBlocks.blocks.length; r++) {
      if (j < dcdata[r].length) result[i++] = dcdata[r][j]
    }
  }
  for (let j = 0; j < maxEcCount; j++) {
    for (let r = 0; r < rsBlocks.blocks.length; r++) {
      if (j < ecdata[r].length) result[i++] = ecdata[r][j]
    }
  }

  return result
}

function getErrorCorrectPolynomial(ecl) {
  let a = new QRPolynomial([1], 0)
  for (let i = 0; i < ecl; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0))
  return a
}

// ====== 掩码函数 ======
function getMaskFunction(maskPattern) {
  switch (maskPattern) {
    case QRMaskPattern.PATTERN000: return function (i, j) { return (i + j) % 2 === 0 }
    case QRMaskPattern.PATTERN001: return function (i, j) { return i % 2 === 0 }
    case QRMaskPattern.PATTERN010: return function (i, j) { return j % 3 === 0 }
    case QRMaskPattern.PATTERN011: return function (i, j) { return (i + j) % 3 === 0 }
    case QRMaskPattern.PATTERN100: return function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0 }
    case QRMaskPattern.PATTERN101: return function (i, j) { return (i * j) % 2 + (i * j) % 3 === 0 }
    case QRMaskPattern.PATTERN110: return function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 === 0 }
    case QRMaskPattern.PATTERN111: return function (i, j) { return ((i * j) % 3 + (i + j) % 2) % 2 === 0 }
    default: throw new Error('bad maskPattern:' + maskPattern)
  }
}

// ====== BitBuffer ======
function QRBitBuffer() {
  this.buffer = []
  this.length = 0
}
QRBitBuffer.prototype = {
  get: function (index) { return ((this.buffer[Math.floor(index / 8)] >>> (7 - index % 8)) & 1) === 1 },
  put: function (num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1) },
  getLengthInBits: function () { return this.length },
  putBit: function (bit) {
    const bufIndex = Math.floor(this.length / 8)
    if (this.buffer.length <= bufIndex) this.buffer.push(0)
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8))
    this.length++
  }
}

// ====== QRCode 核心模型 ======
function QRCodeModel(typeNumber, errorCorrectLevel) {
  this.typeNumber = typeNumber
  this.errorCorrectLevel = errorCorrectLevel
  this.modules = null
  this.moduleCount = 0
  this.dataCache = null
  this.dataList = []
}

QRCodeModel.prototype = {
  addData: function (data) {
    this.dataList.push({ data: String(data), mode: QRMode.MODE_8BIT_BYTE })
    this.dataCache = null
  },

  isDark: function (row, col) {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) throw new Error(row + ',' + col)
    return this.modules[row][col]
  },

  getModuleCount: function () { return this.moduleCount },

  make: function () { this.makeImpl(false, this.getBestMaskPattern()) },

  makeImpl: function (test, maskPattern) {
    this.moduleCount = this.typeNumber * 4 + 17
    this.modules = new Array(this.moduleCount)
    for (let row = 0; row < this.moduleCount; row++) {
      this.modules[row] = new Array(this.moduleCount)
      for (let col = 0; col < this.moduleCount; col++) this.modules[row][col] = null
    }

    // 定位图案
    this.setupPositionProbePattern(0, 0)
    this.setupPositionProbePattern(this.moduleCount - 7, 0)
    this.setupPositionProbePattern(0, this.moduleCount - 7)

    this.setupPositionAdjustPattern()
    this.setupTimingPattern()
    this.setupTypeInfo(test, maskPattern)

    if (this.typeNumber >= 7) this.setupTypeNumber(test)

    if (!this.dataCache) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList)
    this.mapData(this.dataCache, maskPattern)
  },

  setupPositionProbePattern: function (row, col) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue
        this.modules[row + r][col + c] = (
          (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4)
        )
      }
    }
  },

  getBestMaskPattern: function () {
    let minLostPoint = 0
    let pattern = 0
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i)
      const lostPoint = this.getLostPoint()
      if (i === 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; pattern = i }
    }
    return pattern
  },

  setupTimingPattern: function () {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] != null) continue
      this.modules[r][6] = r % 2 === 0
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] != null) continue
      this.modules[6][c] = c % 2 === 0
    }
  },

  setupPositionAdjustPattern: function () {
    const pos = alignmentPatternPositions[this.typeNumber - 1]
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i]; const col = pos[j]
        if (this.modules[row][col] != null) continue
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            this.modules[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0))
          }
        }
      }
    }
  },

  setupTypeInfo: function (test, maskPattern) {
    const data = (this.errorCorrectLevel << 3) | maskPattern
    const bits = getBCHTypeInfo(data)
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      if (i < 6) this.modules[i][8] = mod
      else if (i < 8) this.modules[i + 1][8] = mod
      else this.modules[this.moduleCount - 15 + i][8] = mod
    }
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod
      else this.modules[8][15 - i - 1] = mod
    }
    this.modules[this.moduleCount - 8][8] = !test
  },

  setupTypeNumber: function (test) {
    const bits = getBCHTypeNumber(this.typeNumber)
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod
    }
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod
    }
  },

  mapData: function (data, maskPattern) {
    let inc = -1; let row = this.moduleCount - 1; let bitIndex = 7; let byteIndex = 0
    const maskFunc = getMaskFunction(maskPattern)
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] == null) {
            let dark = false
            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1
            const mask = maskFunc(row, col - c)
            if (mask) dark = !dark
            this.modules[row][col - c] = dark
            bitIndex--
            if (bitIndex === -1) { byteIndex++; bitIndex = 7 }
          }
        }
        row += inc
        if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break }
      }
    }
  },

  getLostPoint: function () {
    const moduleCount = this.moduleCount
    let lostPoint = 0

    // 相邻同色
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        let sameCount = 0
        for (let r = -1; r <= 1; r++) {
          if (row + r < 0 || moduleCount <= row + r) continue
          for (let c = -1; c <= 1; c++) {
            if (col + c < 0 || moduleCount <= col + c) continue
            if (r === 0 && c === 0) continue
            if (this.modules[row + r][col + c] === this.modules[row][col]) sameCount++
          }
        }
        if (sameCount > 5) lostPoint += (3 + sameCount - 5)
      }
    }

    // 2x2 同色块
    for (let row = 0; row < moduleCount - 1; row++) {
      for (let col = 0; col < moduleCount - 1; col++) {
        const count = (this.modules[row][col] ? 1 : 0) + (this.modules[row + 1][col] ? 1 : 0) +
          (this.modules[row][col + 1] ? 1 : 0) + (this.modules[row + 1][col + 1] ? 1 : 0)
        if (count === 0 || count === 4) lostPoint += 3
      }
    }

    // 1:1:3:1:1 模式
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount - 6; col++) {
        if (this.modules[row][col] && !this.modules[row][col + 1] && this.modules[row][col + 2] &&
          this.modules[row][col + 3] && this.modules[row][col + 4] && !this.modules[row][col + 5] &&
          this.modules[row][col + 6]) lostPoint += 40
      }
    }
    for (let col = 0; col < moduleCount; col++) {
      for (let row = 0; row < moduleCount - 6; row++) {
        if (this.modules[row][col] && !this.modules[row + 1][col] && this.modules[row + 2][col] &&
          this.modules[row + 3][col] && this.modules[row + 4][col] && !this.modules[row + 5][col] &&
          this.modules[row + 6][col]) lostPoint += 40
      }
    }

    // 黑白比例
    let darkCount = 0
    for (let row = 0; row < moduleCount; row++)
      for (let col = 0; col < moduleCount; col++)
        if (this.modules[row][col]) darkCount++
    const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5
    lostPoint += ratio * 10

    return lostPoint
  }
}

QRCodeModel.PAD0 = 0xEC
QRCodeModel.PAD1 = 0x11

QRCodeModel.createData = function (typeNumber, errorCorrectLevel, dataList) {
  const rsBlocks = getRSBlocks(typeNumber, errorCorrectLevel)
  if (!rsBlocks) return []
  const buffer = new QRBitBuffer()

  for (let i = 0; i < dataList.length; i++) {
    const data = dataList[i]
    buffer.put(data.mode, 4)
    buffer.put(data.data.length, 8)
    for (let j = 0; j < data.data.length; j++) buffer.put(data.data.charCodeAt(j), 8)
  }

  const totalDataCount = rsBlocks.totalDataCount
  if (buffer.getLengthInBits() > totalDataCount * 8) {
    throw new Error('数据过长：' + buffer.getLengthInBits() + ' > ' + totalDataCount * 8)
  }

  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4)
  while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false)

  while (true) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break
    buffer.put(QRCodeModel.PAD0, 8)
    if (buffer.getLengthInBits() >= totalDataCount * 8) break
    buffer.put(QRCodeModel.PAD1, 8)
  }

  return createBytes(buffer.buffer, rsBlocks)
}

// ====== 版本选择（按纠错等级区分容量） ======
function getTypeNumber(text, errorCorrectLevel) {
  // 每个版本在 [L(1), M(0), Q(3), H(2)] 下的 8-bit-byte 容量
  const capacity = [
    [17,14,11,7],   [32,26,20,14],  [53,42,32,24],  [78,62,46,34],
    [106,84,60,44], [134,106,74,58],[154,122,86,64], [192,152,108,84],
    [230,180,130,98],[271,213,151,119],[321,251,177,137],[367,287,203,155],
    [425,331,241,177],[458,362,258,194],[520,412,292,220],[586,450,322,250],
    [644,504,364,280],[718,560,394,310],[792,624,442,338],[858,666,482,382],
    [929,711,509,403],[1003,779,565,439],[1091,857,611,461],[1171,911,661,511],
    [1273,997,715,535],[1367,1059,751,593],[1465,1125,805,625],[1528,1190,868,658],
    [1628,1264,908,698],[1732,1370,982,742],[1840,1452,1030,790],[1952,1538,1112,842],
    [2068,1628,1168,898],[2188,1722,1228,958],[2303,1809,1283,983],[2431,1911,1351,1051],
    [2563,1989,1423,1093],[2699,2099,1499,1139],[2809,2213,1579,1219],[2953,2331,1663,1273]
  ]
  // errorCorrectLevel → 容量索引映射：L=1→0, M=0→1, Q=3→2, H=2→3
  const idxMap = { 1: 0, 0: 1, 3: 2, 2: 3 }
  const idx = idxMap[errorCorrectLevel]
  for (let i = 0; i < capacity.length; i++) {
    if (capacity[i][idx] >= text.length) return i + 1
  }
  return 40
}

// ====== 对外接口 ======
function QRCode(canvasId, options) {
  this.canvasId = canvasId
  this.options = Object.assign({
    text: '',
    width: 200,
    height: 200,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRErrorCorrectLevel.H
  }, options)
  // 不在构造函数中自动绘制，由调用方显式调用 makeCode
}

QRCode.prototype = {
  makeCode: function (text, callback) {
    const typeNumber = getTypeNumber(text, this.options.correctLevel)
    const qr = new QRCodeModel(typeNumber, this.options.correctLevel)
    qr.addData(text)
    qr.make()

    const count = qr.getModuleCount()
    const width = this.options.width
    const height = this.options.height
    const tileW = width / count
    const tileH = height / count

    const ctx = wx.createCanvasContext(this.canvasId)

    // 背景
    ctx.setFillStyle(this.options.colorLight)
    ctx.fillRect(0, 0, width, height)

    // 前景方块
    ctx.setFillStyle(this.options.colorDark)
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(Math.round(col * tileW), Math.round(row * tileH), Math.ceil(tileW), Math.ceil(tileH))
        }
      }
    }

    // ctx.draw() 在微信小程序中是异步的，必须用回调等待完成
    const that = this
    ctx.draw(false, function () {
      if (typeof callback === 'function') callback()
    })
  },

  clear: function (callback) {
    const ctx = wx.createCanvasContext(this.canvasId)
    ctx.clearRect(0, 0, this.options.width, this.options.height)
    ctx.draw(false, function () {
      if (typeof callback === 'function') callback()
    })
  }
}

QRCode.CorrectLevel = QRErrorCorrectLevel

module.exports = QRCode
