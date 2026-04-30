# `data/` — 名单基线 backup（git 跟踪）

## 用途

本目录是 CloudBase COS 上**真源**文件的**基线快照**，作为防误删 / 防意外覆盖的兜底备份。

| 文件 | CloudBase fileID（生产代码用这个） | 临时签名 URL（仅调试） |
| ---- | ---- | ---- |
| [`2024_02_student_list.json`](2024_02_student_list.json) | `cloud://zy-memoir-d5gaxbvyxe80564f4.7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866/2024_02_student_list.json` | 通过 `cloudbase.queryStorage action=url cloudPath=2024_02_student_list.json` 现取 |
| [`2024_02_teacher_list.json`](2024_02_teacher_list.json) | `cloud://zy-memoir-d5gaxbvyxe80564f4.7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866/2024_02_teacher_list.json` | 通过 `cloudbase.queryStorage action=url cloudPath=2024_02_teacher_list.json` 现取 |

## 数据流（Q-DATA-4 = A）

```
data/2024_02_*_list.json  ←→  CloudBase COS（真源）
                                    ↓ cloudbase.downloadFile({ fileID })
                            云函数 seedStudents / seedTeachers
                                    ↓ db.collection().add()
                            CloudBase 数据库 students / teachers 集合
                                    ↓ db.collection().get()
                                  前端查询
```

> **本目录文件不直接被前端 / 云函数引用**；它的存在仅为：①防 COS 文件被误删时一键恢复；②审计 / 历史回溯名单变更。

## Schema

### `2024_02_student_list.json`

```ts
{
  total: 36,
  students: Array<{
    id: number          // 1~36，与教师录入学号一致
    name: string        // 学生姓名（简体中文）
    gender: 'male' | 'female'
  }>
}
```

### `2024_02_teacher_list.json`

```ts
{
  total: 3,
  teachers: Array<{
    id: number          // 1~3
    name: string        // 教师姓名（"生活老师" 为通用角色名，详见 Q-DATA-1）
    role: 'lead' | 'assistant' | 'life'   // 主班 | 副班 | 生活
  }>
}
```

## 同步规则

- **改名单 = 改本地 + 改 COS**：先改 `data/*.json`，再 `cloudbase.manageStorage action=upload localPath=$(pwd)/data/2024_02_*.json cloudPath=2024_02_*.json` 推到 COS，**两边同时更新**。
- **不允许只改一边**：本地 / COS 不一致时以 **COS 为生产真源**，恢复脚本：

```bash
# 从 COS 拉回覆盖本地 backup（紧急恢复）
npx mcporter call cloudbase.manageStorage \
  action=download \
  cloudPath=2024_02_student_list.json \
  localPath=$(pwd)/data/2024_02_student_list.json \
  --output json
```

## 相关文档

- [`docs/features/memoir-home/plan.md`](../docs/features/memoir-home/plan.md) → `## 现状分析` / `### 文件改动清单` / G2 任务
- [`docs/features/memoir-home/spec.md`](../docs/features/memoir-home/spec.md) → 学生 / 老师数据消费场景
- [`cloudbaserc.json`](../cloudbaserc.json) → CloudBase 环境与云函数声明
