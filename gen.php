<?php
$hash = '';
$raw = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['pwd'])) {
    $raw = $_POST['pwd'];
    $hash = password_hash($raw, PASSWORD_DEFAULT);
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>EasyWebDAV 密码生成器</title>
    <style>
        body { font-family: system-ui, sans-serif; background-color: #f8f9fa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #333; }
        .box { background: #fff; padding: 40px 36px; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); width: 100%; max-width: 400px; box-sizing: border-box; }
        h2 { margin-top: 0; color: #222; font-size: 22px; font-weight: 600; text-align: center; margin-bottom: 24px; }
        .fg { margin-bottom: 20px; text-align: left; }
        label { display: block; margin-bottom: 8px; font-size: 14px; color: #333; font-weight: 500; }
        input { width: 100%; padding: 10px 12px; border: 1px solid #ced4da; border-radius: 4px; box-sizing: border-box; font-size: 15px; transition: border-color .15s; }
        input:focus { outline: none; border-color: #5c6bc0; box-shadow: 0 0 0 2px rgba(92,107,192,0.15); }
        button { background: #5c6bc0; color: #fff; border: none; padding: 12px; border-radius: 4px; font-size: 16px; cursor: pointer; width: 100%; margin-top: 8px; transition: background .15s; font-weight: 600; }
        button:hover { background: #3949ab; }
        .result { margin-top: 24px; padding: 16px; background: #f1f3f5; border-radius: 4px; border-left: 4px solid #5c6bc0; word-break: break-all; font-family: monospace; font-size: 14px; line-height: 1.5; }
        .copy-hint { font-size: 12px; color: #868e96; margin-top: 8px; text-align: center; display: block; }
    </style>
</head>
<body>
    <div class="box">
        <h2>密码哈希生成器</h2>
        <form method="post">
            <div class="fg">
                <label>请输入你的明文密码：</label>
                <input type="text" name="pwd" value="<?=htmlspecialchars($raw)?>" required autofocus autocomplete="off">
            </div>
            <button type="submit">生成密文</button>
        </form>

        <?php if ($hash): ?>
        <div class="result">
            <strong>生成的密文（请复制下方整行）：</strong><br><br>
            <?=htmlspecialchars($hash)?>
        </div>
        <span class="copy-hint">将上面的密文复制，粘贴到 index.php 的 $auth_users 数组中即可。</span>
        <?php endif; ?>
    </div>
</body>
</html>
