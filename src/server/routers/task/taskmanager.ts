import { Task, TaskArgs, TaskStatusType } from "./task";
import { TaskQueue } from "./taskqueue"; 

export class TaskManger{
    
    readonly queue: TaskQueue = new TaskQueue({ concurrentTaskCount: 2 });

    constructor() {
    }
    
    listTasks(): Task[]{
        return [];
    }
    
    queryTask(): any{
    }
    
    removeTask(): Task|undefined{
        return;
    }
    
    addTask(): Task{
    }
}