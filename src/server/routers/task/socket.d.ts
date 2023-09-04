export interface ServerToClientEvents {
    TaskEvent: (msg: any)=>void;
}

export interface ClientToServerEvents {
    SubmitTask: (taskArgs: any, type: string) => void;
    TaskEvent: (msg: any) => void;
}

export interface InterServerEvents {
}

export interface SocketData {
    name: string;
    age: number;
}