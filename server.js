const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3333;

// 加载公式数据
const formulasPath = path.join(__dirname, 'data', 'formulas.json');
let formulas = [];
try {
  formulas = JSON.parse(fs.readFileSync(formulasPath, 'utf-8'));
  console.log(`已加载 ${formulas.length} 条公式`);
} catch (err) {
  console.error('公式数据加载失败:', err.message);
  process.exit(1);
}

// 加载单位换算数据
const conversionsPath = path.join(__dirname, 'data', 'conversions.json');
let conversions = [];
try {
  conversions = JSON.parse(fs.readFileSync(conversionsPath, 'utf-8'));
  console.log(`已加载 ${conversions.length} 组单位换算`);
} catch (err) {
  console.error('单位换算数据加载失败:', err.message);
  process.exit(1);
}

// 加载元素周期表数据
const periodicPath = path.join(__dirname, 'data', 'periodic-table.json');
let periodicTable = [];
try {
  periodicTable = JSON.parse(fs.readFileSync(periodicPath, 'utf-8'));
  console.log(`已加载 ${periodicTable.length} 个化学元素`);
} catch (err) {
  console.error('元素周期表数据加载失败:', err.message);
  process.exit(1);
}

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// API: 获取全部公式（支持 ?subject=math&grade=7&keyword=xxx）
app.get('/api/formulas', (req, res) => {
  const { subject, grade, keyword } = req.query;
  let result = [...formulas];

  if (subject && subject !== 'all') {
    result = result.filter(f => f.subject === subject);
  }
  if (grade && grade !== 'all') {
    result = result.filter(f => f.grade === parseInt(grade));
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    result = result.filter(f =>
      f.name.toLowerCase().includes(kw) ||
      f.formula.toLowerCase().includes(kw) ||
      f.desc.toLowerCase().includes(kw) ||
      f.tags.some(t => t.toLowerCase().includes(kw))
    );
  }

  // 按年级 → 学科 → id 排序
  result.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade;
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    return a.id - b.id;
  });

  res.json({ total: result.length, data: result });
});

// API: 获取单个公式
app.get('/api/formulas/:id', (req, res) => {
  const f = formulas.find(x => x.id === parseInt(req.params.id));
  if (!f) return res.status(404).json({ error: '公式不存在' });
  res.json(f);
});

// API: 获取所有标签
app.get('/api/tags', (req, res) => {
  const { subject } = req.query;
  let src = formulas;
  if (subject && subject !== 'all') src = src.filter(f => f.subject === subject);
  const tagSet = new Set();
  src.forEach(f => f.tags.forEach(t => tagSet.add(t)));
  res.json({ tags: [...tagSet].sort() });
});

// API: 统计信息
app.get('/api/stats', (req, res) => {
  const subjects = {};
  let totalTags = new Set();
  formulas.forEach(f => {
    subjects[f.subject] = (subjects[f.subject] || 0) + 1;
    f.tags.forEach(t => totalTags.add(t));
  });
  res.json({
    total: formulas.length,
    subjects,
    totalTags: totalTags.size
  });
});

// API: 获取单位换算数据（支持 ?category=xxx）
app.get('/api/conversions', (req, res) => {
  const { category } = req.query;
  let result = [...conversions];
  if (category && category !== 'all') {
    result = result.filter(c => c.id === category);
  }
  res.json({ total: result.length, data: result });
});

// API: 获取元素周期表数据（支持 ?z=1 查询单个元素）
app.get('/api/periodic-table', (req, res) => {
  const { z, category } = req.query;
  let result = [...periodicTable];
  if (z) {
    result = result.filter(e => e.z === parseInt(z));
  }
  if (category && category !== 'all') {
    result = result.filter(e => e.cat === category);
  }
  res.json({ total: result.length, data: result });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}`);
});
