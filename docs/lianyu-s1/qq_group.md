# 赛事 QQ 群

## API：查询用户是否在赛事群

env BOT_SERVER_ORIGIN  
env BOT_SERVER_TOKEN

```
curl -X POST "${BOT_SERVER_ORIGIN}/get_group_member_list" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BOT_SERVER_TOKEN}" \
  -d '{
    "group_id": 1016833703,
    "no_cache": true
  }'
```

```
[{"user_id":1211660648,"nickname":"谷雨同学"}]
```

## 赛事群信息

点击链接加入群聊【恋雨杯 S1 比赛群】：https://qm.qq.com/q/ENPYnNYYak

![qr_code](qq_group.png)
