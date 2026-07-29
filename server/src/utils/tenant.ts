import User from '../models/User';

export const getTenantId = (reqUser: any): string => {
    const tid = reqUser.tenantId?._id || reqUser.tenantId;
    if (!tid) throw new Error('User has no tenant assigned');
    return tid.toString();
};

export const getTenantUserIds = async (reqUser: any): Promise<string[]> => {
    const tenantId = getTenantId(reqUser);
    const users = await User.find({ tenantId }).distinct('_id');
    return users.map((id: any) => id.toString());
};
