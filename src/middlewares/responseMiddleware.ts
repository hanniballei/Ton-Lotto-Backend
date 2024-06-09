import { NextFunction, Request, Response } from 'express'

const responseMiddleware = (req: Request, res: Response, next: NextFunction) => {

    res.success = (data: any, code = 200, msg = 'Success') => {
        res.status(code).json({ code, msg, data })
    }

    res.error = (msg = 'Internal Server Error', code = 500, data = null) => {
        res.status(code).json({ code, msg, data })
    }

    res.authFail = (msg = "Invalid token", code = 401, data = null) => {
        res.status(code).json({ code, msg, data })
    }

    next()
}

declare global {
    namespace Express {
        interface Response {
            success: (data: any, code?: number, msg?: string) => void;
            error: (msg?: string, code?: number, data?: any) => void;
            authFail: (msg?: string, code?: number, data?: any) => void;
        }
    }
}

export default responseMiddleware;