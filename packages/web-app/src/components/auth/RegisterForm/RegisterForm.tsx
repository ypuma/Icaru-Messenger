import AccountCreation from './AccountCreation';

interface AccountData {
  handle: string;
  publicKey: string;
  privateKey: string;
  accountId?: string;
}

interface RegisterFormProps {
  onAccountCreated: (userData: {
    handle: string;
    publicKey: string;
    privateKey: string;
  }) => void;
  onSwitchToRecovery: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onAccountCreated, onSwitchToRecovery }) => {

  const handleAccountCreated = (accountData: AccountData) => {
    console.log('Account created in RegisterForm:', accountData);
    if (onAccountCreated) {
      onAccountCreated(accountData);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="w-full max-w-md p-6 space-y-8">
        <AccountCreation onAccountCreated={handleAccountCreated} />
        <div className="mt-4 text-center">
          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <button
              onClick={onSwitchToRecovery}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Recover it here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;