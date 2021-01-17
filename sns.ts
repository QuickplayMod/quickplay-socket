import * as aws from 'aws-sdk'

aws.config.update({region:'us-east-1'})
// Create SNS object for text notifications
let sns
if(process.env.AWS_PROFILE) {
    sns = new aws.SNS({credentials: new aws.SharedIniFileCredentials({profile: process.env.AWS_PROFILE})})
} else
    sns = new aws.SNS()

export default {
    publish(msg: string): Promise<void> {
        return new Promise((resolve, reject) => {
            sns.publish({
                Message: msg,
                TopicArn: process.env.AWS_SNS_TOPIC
            }, (err) => {
                if(err) {
                    reject(err)
                    return
                }
                resolve()
            })
        })
    }
}
