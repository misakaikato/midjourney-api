enum TaskStatus {
    NOT_SUBMITTED = "NOT_SUBMITTED",           // 未提交
    SUBMITTED_TO_LOCAL_QUEUE = "SUBMITTED_TO_LOCAL",  // 提交至本地任务队列
    LOCAL_QUEUE_PENDING = "LOCAL_PENDING",     // 本地任务队列排队中
    SUBMITTING_TO_MJ_SERVER = "SUBMITTING_TO_MJ",    // 开始提交至MJ服务器
    MJ_SERVER_PENDING = "MJ_PENDING",          // MJ服务器排队中
    IMAGE_UPLOAD_SUCCESS = "IMG_UPLOAD_SUCCESS", // 图片上传成功
    IMAGE_UPLOAD_FAILED = "IMG_UPLOAD_FAILED", // 图片上传失败
    IMAGE_MSG_SENT = "IMG_MSG_SENT",           // 图片消息已发送
    IMAGE_MSG_NOT_SENT = "IMG_MSG_NOT_SENT",   // 图片消息未发送
    EXECUTING = "EXECUTING",                   // 开始执行
    TASK_COMPLETED = "TASK_COMPLETED",         // 任务执行完成
    TASK_FAILED = "TASK_FAILED",               // 任务执行失败
    TASK_TIMEOUT = "TASK_TIMEOUT"              // 任务超时
}

export default TaskStatus;