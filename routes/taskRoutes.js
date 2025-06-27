import React, { useState } from 'react';
import { User } from '../types';

interface AdminTourProps {
  user: User;
  onClose: (completed: boolean) => void;
}

interface TourStep {
  title: string;
  content: React.ReactNode;
}

const AdminTour: React.FC<AdminTourProps> = ({ user, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const adminTourSteps: TourStep[] = [
    {
      title: `Welcome, Administrator ${user.displayName}!`,
      content: (
        <p>
          This guide will walk you through the key features for managing your organization.
        </p>
      ),
    },
    {
      title: "The Dashboard",
      content: (
        <>
          <p>Your <strong>Dashboard</strong> provides a high-level overview of your organization's activity.</p>
          <p className="mt-2">You can see statistics for users, pending approvals, tasks, and assignments at a glance.</p>
        </>
      ),
    },
    {
      title: "User Management",
      content: (
        <>
          <p>The <strong>Users</strong> page is your central hub for managing people.</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li><strong>Approve</strong> new users from the 'Pending Approvals' list.</li>
            <li><strong>Create</strong> new user accounts directly.</li>
            <li><strong>Generate</strong> a pre-registration link for users to sign themselves up for approval.</li>
          </ul>
        </>
      ),
    },
    {
      title: "Step 1: Create a Program",
      content: (
        <>
          <p>Go to <strong>Programs</strong> to create broad categories for your work, like "Annual Conference" or "Q3 Marketing Campaign".</p>
          <p className="mt-2">This helps organize your tasks.</p>
        </>
      ),
    },
    {
      title: "Step 2: Create a Task",
      content: (
        <>
          <p>In <strong>Manage Tasks</strong>, you can create specific tasks. Be sure to list the 'Required Skills'.</p>
          <p className="mt-2">Good skill descriptions are key to getting relevant AI-powered assignment suggestions.</p>
        </>
      ),
    },
    {
      title: "Step 3: Assign Work with AI",
      content: (
        <>
          <p>The <strong>Assign Work</strong> page is where the magic happens. Select a task, then click 'Get AI Suggestion'.</p>
          <p className="mt-2">The AI will analyze the task's required skills and your users' profiles to recommend the best person for the job.</p>
        </>
      ),
    },
    {
      title: "Monitor Progress",
      content: (
        <>
          <p>Use the <strong>My Assignments</strong> page to view the status of all assignments across your organization.</p>
          <p className="mt-2">You can see what's pending, in progress, and what's been submitted for your final approval.</p>
        </>
      ),
    },
    {
      title: "You're All Set!",
      content: (
        <p>
          That's the basics of managing your Task Assignment Assistant. You can now close this tour and get started!
        </p>
      ),
    },
  ];

  const handleNext = () => {
    if (currentStep < adminTourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose(true); // Completed
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose(false); // Skipped
  };
  
  const step = adminTourSteps[currentStep];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-labelledby="admin-tour-title">
      <div className="bg-surface rounded-lg shadow-xl p-6 w-full max-w-md transform transition-all">
        <h2 id="admin-tour-title" className="text-xl font-semibold text-primary mb-4">{step.title}</h2>
        <div className="text-sm text-textlight space-y-3 mb-6 min-h-[100px]">
          {step.content}
        </div>
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200">
          <div>
            {currentStep > 0 && (
              <button
                onClick={handlePrevious}
                className="btn-neutral px-3 py-1.5 text-sm mr-2"
              >
                Previous
              </button>
            )}
          </div>
          <div className="flex items-center">
             <button
                onClick={handleSkip}
                className="text-sm text-neutral hover:text-texthighlight mr-4"
              >
                Skip Tour
              </button>
            {currentStep < adminTourSteps.length - 1 ? (
              <button
                onClick={handleNext}
                className="btn-primary px-3 py-1.5 text-sm"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => onClose(true)}
                className="btn-success px-3 py-1.5 text-sm"
              >
                Finish Tour
              </button>
            )}
          </div>
        </div>
         <div className="text-center mt-3">
            <p className="text-xs text-neutral">Step {currentStep + 1} of {adminTourSteps.length}</p>
          </div>
      </div>
    </div>
  );
};

export default AdminTour;
